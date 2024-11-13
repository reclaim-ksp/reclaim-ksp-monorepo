#!/usr/bin/env -S node --import=tsx/esm
import chalk from "chalk";
import { dirname, filename, join } from "desm";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import process from "process";
import { useArchiver, useAsyncOperation } from "@reclaim-ksp/internal-utils";

const __dirname = dirname(import.meta.url);
const __filename = filename(import.meta.url);
const __join = (...str: string[]) => join(import.meta.url, ...str);
const __root = (...str: string[]) => __join("../../", ...str);
const cwd_original = process.cwd();
const ROOT_PATH_DIST = `dist`;

await async function main() {
    const spinner = ora();
    const { asyncOperation, } = useAsyncOperation(spinner);
    const { zip, } = useArchiver();

    const DIRNAME_TO_BE_ZIPPED = `GameData`;
    const PATH_ZIP_TARGET = __root(`./${ROOT_PATH_DIST}`);
    const { PACKAGE_NAME, FILENAME_ZIP, } = (() => {
        const split = cwd_original.split(path.sep);
        const PACKAGE_NAME = split[split.length - 1];
        const FILENAME_ZIP = `${PACKAGE_NAME}.zip`;
        return { PACKAGE_NAME, FILENAME_ZIP, };
    })();

    console.info(`📦 - ${chalk.underline(PACKAGE_NAME)}`);

    const _path_toBeZipped = await asyncOperation(
        `Looking for "${DIRNAME_TO_BE_ZIPPED}" folder inside cwd: "${cwd_original}"`,
        async ({ succeed, fail, }) => {
            const _path = path.resolve(cwd_original, `./${DIRNAME_TO_BE_ZIPPED}/`);
            const exists = fs.existsSync(_path);

            if (exists) { succeed(); return _path; }
            else return fail();
        },
    );

    const _path_toPlaceZippedFolder = await asyncOperation(
        `Looking for ZIP target folder "${PATH_ZIP_TARGET}"`,
        async ({ succeed, fail, }) => {
            const exists = fs.existsSync(PATH_ZIP_TARGET);

            if (exists) { succeed(); return PATH_ZIP_TARGET; }
            else return fail();
        },
    );


    const zipResult = await asyncOperation(
        `Creating ZIP archive "${FILENAME_ZIP}"`,
        async ({ succeed, fail, change, }) => {
            const glob = [
                `GameData/**/*`,
            ] as const satisfies string[];

            const outputFilePath = path.join(_path_toPlaceZippedFolder, FILENAME_ZIP);

            const percentage = (curr: number, max: number): number => (Math.min(1, Math.max(0, (curr / max))) * 100);
            const padPercent = (num: number, decimals: number = 2): string => num
                .toFixed(decimals)
                .padStart((decimals === 0 ? 3 : 4) + decimals, " ")
                .padEnd((decimals === 0 ? 3 : 4), ".")
                .padEnd((decimals === 0 ? 3 : 4) + decimals, "0")
            ;

            change((text) => `${text}: ${padPercent(0)}%`);

            try {
                const { bytes, } = await zip({
                    glob,
                    outputFilePath: outputFilePath,
                    cwd:            cwd_original,

                    progressCb: ({ fs, }) => {
                        const { processedBytes, totalBytes, } = fs;
                        change((text) => `${text}: ${padPercent(percentage(processedBytes, totalBytes))}%`);
                    },
                });

                succeed((text) => `${text}: ${padPercent(100)}%`); return { outputFilePath, bytes, };
            } catch (error) {
                return fail();
            }
        },
    );

    console.info(`${chalk.green(`✔`)} Created "${zipResult.outputFilePath}", size: ${new Intl.NumberFormat("fr-FR").format(zipResult.bytes)} bytes`);
    console.info(chalk.green(`✔ Done!`));

}();
