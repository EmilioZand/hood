// Import this module FIRST (before any module that reads process.env at load
// time, e.g. src/db) — ESM hoists all `import` declarations above ordinary
// statements, so a same-file `config()` call after other imports runs too late.
import { config } from "dotenv";

config({ path: ".env.local" });
