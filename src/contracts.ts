import { readFileSync } from "node:fs";

import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});

addFormats(ajv);

function loadSchema(name: string): object {
  const url = new URL(`../schemas/v1/${name}.schema.json`, import.meta.url);

  return JSON.parse(readFileSync(url, "utf8")) as object;
}

ajv.addSchema(loadSchema("finding"));
const validate = ajv.compile(loadSchema("review"));

/** Validate the external Oracle contract before any workflow state is changed. */
export function validateReviewContract(value: unknown): void {
  if (validate(value)) {
    return;
  }

  const detail = ajv.errorsText(validate.errors, { separator: "; " });

  throw new Error(`Invalid Oracle review v1 contract: ${detail}`);
}
