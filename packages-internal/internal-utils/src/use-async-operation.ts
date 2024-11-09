import type { Ora } from "ora";
import type { Promisable } from "type-fest";

export function useAsyncOperation(ora: Ora) {
    async function asyncOperation<R>(
        text: string,
        operationFn: (messageFns: {
            succeed: (message?: string | ((text: string) => string)) => void,
            fail:    (message?: string | ((text: string) => string)) => never,
            pause:   () => void,
            resume:  () => void,
            change:  (message: string | ((text: string) => string)) => void,
        }) => Promisable<R>,
    ) {
        const textOriginal = text;
        ora.start(textOriginal);
        try {
            const result = await operationFn({
                succeed(message) {
                    const _message: string = (typeof message === "function" ? message(textOriginal) : message) ?? textOriginal;
                    ora.succeed(_message);
                },
                fail(message) {
                    const _message: string = (typeof message === "function" ? message(textOriginal) : message) ?? textOriginal;
                    ora.fail(_message);
                    throw new Error(_message);
                },
                pause() {
                    ora.stopAndPersist();
                },
                resume() {
                    ora.start(textOriginal);
                },
                change(message) {
                    const _message: string = (typeof message === "function" ? message(textOriginal) : message);
                    ora.text = _message;
                },
            });
            ora.stop();
            return result;
        } catch (error) {
            ora.fail();
            ora.stop();
            throw error;
        }
    }

    return {
        asyncOperation,
    };
}
