import fs from "fs";
import archiver from "archiver";
import { readdirGlob, type Match } from "readdir-glob";

type CreateWriteStream_Options = Parameters<typeof fs.createWriteStream>[1];
export function useArchiver() {
    return {
        zip,
    };
}

async function zip(options: {
    outputFilePath: string,
    glob:           string[],

    progressCb?: (progress: archiver.ProgressData) => void,

    /** Working directory used for matching the provided glob patterns */
    cwd?:                 string,
    outputStreamOptions?: CreateWriteStream_Options,
}) {
    const { outputFilePath, glob, progressCb, cwd = process.cwd(), outputStreamOptions, } = options;

    const globResults = await globMatch({ glob, cwd, });

    const output = fs.createWriteStream(outputFilePath, outputStreamOptions);

    const archive = archiver("zip", {
        zlib: { level: 9, },
    });

    const close = new Promise<{ bytes: number, }>((resolve, reject) => {
        output.on("finish", function () {
            const bytes = archive.pointer();
            resolve({ bytes, });
        });
    });

    if (progressCb) archive.on("progress", (progress) => {
        const {
            entries: { processed, total: _total, },
            fs: { processedBytes, totalBytes: _totalBytes, },
        } = progress;
        const total = Math.max(_total, globResults.files.length);
        const totalBytes = Math.max(_totalBytes, globResults.totalBytes);
        progressCb({ entries: { processed, total, }, fs: { processedBytes, totalBytes, }, });
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on("warning", function (err) {
        if (err.code === "ENOENT") {
            console.warn(err);
        } else {
            throw err;
        }
    });

    // good practice to catch this error explicitly
    archive.on("error", function (err) {
        throw err;
    });

    // pipe archive data to the file
    archive.pipe(output);

    // append files from a glob pattern
    for (const _glob of glob) {
        archive.glob(_glob, { cwd, });
    }

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
    archive.finalize();

    return await close;
}

type GlobMatchResult_Entry = { absolute: string, relative: string, sizeBytes: number, };
type GlobMatchResult = { files: GlobMatchResult_Entry[], totalBytes: number, };
async function globMatch(options: {
    glob: string[],
    cwd:  string,
}) {
    const { glob, cwd, } = options;

    const results = await new Promise<Match[]>((resolve, reject) => {
        const matches: Match[] = [];
        const _readdirGlob = readdirGlob(cwd, { pattern: glob, stat: true, });
        _readdirGlob.on("match", (match) => matches.push(match));
        _readdirGlob.on("error", err => reject(err));
        _readdirGlob.on("end", () => resolve(matches));
    });

    const result = results.reduce((acc, result) => {
        const { absolute, relative, stat: _stat, } = result;
        const stat = _stat as fs.Stats;
        const file: GlobMatchResult_Entry[] = stat.isFile() ? [{ absolute, relative, sizeBytes: stat.size, }] : [];
        const [{ sizeBytes = 0, } = {}] = file;
        return { files: [...acc.files, ...file], totalBytes: acc.totalBytes + sizeBytes, };
    }, { files: [] as GlobMatchResult_Entry[], totalBytes: 0, } satisfies GlobMatchResult);

    return result;
}
