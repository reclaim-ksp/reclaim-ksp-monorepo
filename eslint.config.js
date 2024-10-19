// @ts-check
import { defineFlatConfig } from "eslint-define-config";
import { config_typescript } from "./.eslint/config-typescript.js";

export default defineFlatConfig([
    config_typescript(),
]);
