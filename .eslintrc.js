/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@beacon/eslint-config"],
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
};
