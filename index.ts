#!/usr/bin/env bun

import { run } from "./src/cli.ts";

// Launch the frontcrypt CLI with provided arguments.
void run(Bun.argv.slice(2));
