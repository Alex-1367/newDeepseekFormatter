#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import DeepSeekFormatter from './formatter.js';
import chalk from 'chalk';

const argv = yargs(hideBin(process.argv))
    .option('input', {
        alias: 'i',
        type: 'string',
        description: 'Input JSON file',
        default: 'conversations.json'
    })
    .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output directory',
        default: 'formatted'
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Verbose output'
    })
    .help()
    .alias('help', 'h')
    .argv;

async function main() {
    console.log(chalk.blue.bold('\n🤖 DeepSeek Chat Formatter v1.0\n'));
    
    const formatter = new DeepSeekFormatter({
        inputFile: argv.input,
        outputDir: argv.output,
        verbose: argv.verbose
    });

    try {
        await formatter.formatAll();
    } catch (error) {
        console.error(chalk.red.bold('\n❌ Fatal error:'), error.message);
        process.exit(1);
    }
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
    console.error(chalk.red.bold('Unhandled rejection:'), error);
    process.exit(1);
});

// Run the main function
main();