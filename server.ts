#!/usr/bin/env node

import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { getNodeRecipeAnalyzer } from "./src/node-analyzer.ts";
import { startRecipeServer } from "./src/server-common.ts";

const connection = createConnection(ProposedFeatures.all);

startRecipeServer(connection, getNodeRecipeAnalyzer);
