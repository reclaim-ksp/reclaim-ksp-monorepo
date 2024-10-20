#!/usr/bin/env -S node --import=tsx/esm
import chalk from "chalk";
import { dirname, filename, join } from "desm";
import fs from "fs-extra";
import { Octokit } from "octokit";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import ora from "ora";
import path from "path";
import process from "process";
import { useAsyncOperation } from "@reclaim-ksp/internal-utils";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import "dotenv/config";

const __dirname = dirname(import.meta.url);
const __filename = filename(import.meta.url);
const __join = (...str: string[]) => join(import.meta.url, ...str);
const __root = (...str: string[]) => __join("../../", ...str);
const cwd_original = process.cwd();
const ROOT_PATH_DIST = `dist`;

/**
 * For some reason, `publishedPackages` is encoded wrongly, it's a JSON string that needs additional parsing
 */
const ChangesetsTypes_Output_Verbatim = Type.Object({
    published:         Type.Boolean(),
    publishedPackages: Type.String(),
    hasChangesets:     Type.Boolean(),
}, { $id: "ChangesetsTypes_Output_Verbatim", });
type ChangesetsTypes_Output_Verbatim = Static<typeof ChangesetsTypes_Output_Verbatim>;
/**
 * ! NOTE: this will have to be updated once this PR drops: https://github.com/changesets/action/pull/347
 */
const ChangesetsTypes_Output = Type.Object({
    published:         Type.Boolean(),
    publishedPackages: Type.Array(Type.Object({ name: Type.String(), version: Type.String(), })),
    hasChangesets:     Type.Boolean(),
}, { $id: "ChangesetsTypes_Output", });
type ChangesetsTypes_Output = Static<typeof ChangesetsTypes_Output>;

await async function main() {
    const {
        CHANGESET_OUTPUTS,
        GITHUB_OWNER,
        GITHUB_REPOSITORY_NAME,
        GITHUB_TOKEN,
    } = (() => {
        const {
            CHANGESET_OUTPUTS: _CHANGESET_OUTPUTS,
            GITHUB_CONTEXT_REPOSITORY,
            GITHUB_TOKEN,
        } = process.env;

        if (!GITHUB_TOKEN) {
            throw Error("Env var GITHUB_TOKEN is missing");
        }

        if (!_CHANGESET_OUTPUTS) {
            throw Error("Env var CHANGESET_OUTPUTS is missing");
        }
        const _PARSED = JSON.parse(_CHANGESET_OUTPUTS);
        const _CHANGESET_OUTPUTS_VERBATIM = Value.Convert(ChangesetsTypes_Output_Verbatim, _PARSED);
        Value.Assert(ChangesetsTypes_Output_Verbatim, _CHANGESET_OUTPUTS_VERBATIM);
        const publishedPackages = Value.Convert(ChangesetsTypes_Output.properties["publishedPackages"], JSON.parse(_CHANGESET_OUTPUTS_VERBATIM.publishedPackages));
        Value.Assert(ChangesetsTypes_Output.properties["publishedPackages"], publishedPackages);
        const CHANGESET_OUTPUTS: ChangesetsTypes_Output = { ..._CHANGESET_OUTPUTS_VERBATIM, publishedPackages, };
        console.log("CHANGESET_OUTPUTS");
        console.log("_PARSED");
        console.log(_PARSED);
        console.log("_CHANGESET_OUTPUTS_VERBATIM");
        console.log(_CHANGESET_OUTPUTS_VERBATIM);
        console.log("CHANGESET_OUTPUTS");
        console.log(CHANGESET_OUTPUTS);
        console.log("//CHANGESET_OUTPUTS");
        Value.Assert(ChangesetsTypes_Output, CHANGESET_OUTPUTS);

        const [GITHUB_OWNER, GITHUB_REPOSITORY_NAME] = GITHUB_CONTEXT_REPOSITORY?.split("/") ?? new Array<undefined>();
        if (!GITHUB_OWNER) {
            throw Error(`Env var GITHUB_CONTEXT_REPOSITORY did not contain GITHUB_OWNER: ${GITHUB_CONTEXT_REPOSITORY}`);
        }
        if (!GITHUB_REPOSITORY_NAME) {
            throw Error(`Env var GITHUB_CONTEXT_REPOSITORY did not contain GITHUB_REPOSITORY_NAME: ${GITHUB_CONTEXT_REPOSITORY}`);
        }

        return { CHANGESET_OUTPUTS, GITHUB_OWNER, GITHUB_REPOSITORY_NAME, GITHUB_TOKEN, };
    })();

    const spinner = ora();
    const { asyncOperation, } = useAsyncOperation(spinner);
    const octokit = new Octokit({ auth: GITHUB_TOKEN, });

    const releases = await asyncOperation(
        `Getting releases of this repository ("${GITHUB_OWNER}/${GITHUB_REPOSITORY_NAME}")`,
        async ({ succeed, fail, }) => {
            try {
                const res = await octokit.rest.repos.listReleases({ owner: GITHUB_OWNER, repo: GITHUB_REPOSITORY_NAME, });
                succeed();
                return res.data;
            } catch (error) {
                return fail();
            }
        },
    );

    console.log("Changesets output", CHANGESET_OUTPUTS);
    console.log("GitHub releases", releases);

    /**
     * changesets publishes first, without assets, we need to add them
     * by the time we are in this script, builds should have already ran, zip files should be available
     * 
     * for each changesets publish, we have to find the related GH release
     * once I have that, each GH release needs the appropriate ZIPs uploaded
     */

    const processedReleases = await asyncOperation(
        `Uploading assets`,
        async ({ succeed, fail, change, }) => {
            try {
                /**
                 * ! NOTE this may be simplified or this script entirely removed once https://github.com/changesets/action/pull/347 is accepted
                 */
                const changesetsPublishedPackagesWithAssociatedGitHubReleases = CHANGESET_OUTPUTS.publishedPackages.map(publishedPackage => {
                    /**
                     * NOTE:
                     * Format of `publishedPackages`:
                     * [{"name": "reclaim-ksp-dres", "version": "0.1.1"}, {"name": "reclaim-ksp-patches", "version": "0.1.1"}]
                     */
                    const { name, version, } = publishedPackage;
                    const _shouldMatchInGitHubRelease_tag_name = `${name}@${version}`;
                    const associatedGitHubRelease = releases.find((release) => release.tag_name === _shouldMatchInGitHubRelease_tag_name);
                    if (!associatedGitHubRelease) {
                        throw new Error(`Couldn't associate any GitHub release to the following Changesets publish result: ${JSON.stringify(publishedPackage)}`);
                    }
                    return { publishedPackage, associatedGitHubRelease, };
                });

                const length = changesetsPublishedPackagesWithAssociatedGitHubReleases.length;
                const results = new Array<&(
                    & (typeof changesetsPublishedPackagesWithAssociatedGitHubReleases)[number]
                    & {
                        uploadedReleaseAsset: RestEndpointMethodTypes["repos"]["uploadReleaseAsset"]["response"],
                    }
                )>();
                for await (const entry of changesetsPublishedPackagesWithAssociatedGitHubReleases) {
                    const {
                        associatedGitHubRelease: { id: release_id, assets: release_assets, name: release_name, },
                        publishedPackage: { name, version, },
                    } = entry;

                    const fullPathToZipFileOfPackage = __root(`./${ROOT_PATH_DIST}/${name}.zip`);
                    const data = fs.readFileSync(fullPathToZipFileOfPackage, { encoding: "binary", });

                    const owner = GITHUB_OWNER;
                    const repo = GITHUB_REPOSITORY_NAME;
                    const mediaType = { format: `application/zip`, };
                    change((text) => `${text}: (${results.length + 1}/${length}) ⌛ "${name}" to release "${release_name}" (id: ${release_id})`);
                    const uploadedReleaseAsset = await octokit.rest.repos.uploadReleaseAsset({ owner, repo, release_id, mediaType, name, data, });
                    change((text) => `${text}: (${results.length + 1}/${length}) ✅ "${name}" to release "${release_name}" (id: ${release_id})`);
                    results.push({ ...entry, uploadedReleaseAsset, });
                }

                succeed((text) => `${text}: uploaded ${results.length} assets`);
                return results;
            } catch (error) {
                return fail();
            }
        },
    );

    console.group(`${chalk.green(`✔`)} Processed releases:`);
    for (const element of processedReleases) {
        console.info(element);
    }
    console.info(chalk.green(`✔ Done!`));
    console.groupEnd();

}();

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace NodeJS {
        interface ProcessEnv {
            CHANGESET_OUTPUTS?:         string,
            GITHUB_CONTEXT_REPOSITORY?: `${string}/${string}`,
            GITHUB_TOKEN?:              string,
        }
    }
}
