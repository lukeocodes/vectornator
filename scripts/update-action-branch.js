#!/usr/bin/env node

/**
 * Script to update action.yml with the metadata branch from constants
 * This is run during build to keep action.yml in sync with the constants
 */

const fs = require("fs");
const path = require("path");

// Read the constants file
const constantsPath = path.join(__dirname, "..", "src", "constants.ts");
const constantsContent = fs.readFileSync(constantsPath, "utf8");

// Extract the DEFAULT_METADATA_BRANCH value
const match = constantsContent.match(
  /DEFAULT_METADATA_BRANCH\s*=\s*['"]([^'"]+)['"]/
);
if (!match) {
  console.error("Could not find DEFAULT_METADATA_BRANCH in constants.ts");
  process.exit(1);
}

const metadataBranch = match[1];
console.log(`Found metadata branch: ${metadataBranch}`);

// Read action.yml
const actionPath = path.join(__dirname, "..", "action.yml");
const actionContent = fs.readFileSync(actionPath, "utf8");

// Replace all occurrences of the branch name
const updatedContent = actionContent
  .replace(
    /git fetch origin [^:]+:[^:]+/g,
    `git fetch origin ${metadataBranch}:${metadataBranch}`
  )
  .replace(
    /git rev-parse --verify [^>]+/g,
    `git rev-parse --verify ${metadataBranch}`
  )
  .replace(/git push origin [^2]+/g, `git push origin ${metadataBranch} `);

// Write back
fs.writeFileSync(actionPath, updatedContent);
console.log("Updated action.yml with metadata branch from constants");
