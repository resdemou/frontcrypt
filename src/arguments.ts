type CliOptions = {
    outputDir?: string;
    password?: string;
    help?: boolean;
};

type ParsedArguments = {
    options: CliOptions;
    positional: string[];
};

// Parse CLI arguments into options and positional parameters.
export function parseArguments(argv: string[]): ParsedArguments {
    const options: CliOptions = {};
    const positional: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]!;
        switch (argument) {
            case "--help":
            case "-h":
                options.help = true;
                continue;
            case "--password": {
                const value = argv[index + 1];
                if (value === undefined) {
                    throw new Error("Missing value for --password option");
                }
                options.password = value;
                index += 1;
                continue;
            }
            case "-o":
            case "--output": {
                const value = argv[index + 1];
                if (value === undefined) {
                    throw new Error("Missing value for --output option");
                }
                options.outputDir = value;
                index += 1;
                continue;
            }
            default:
                if (argument.startsWith("-")) {
                    throw new Error(`Unknown option ${argument}`);
                }
                positional.push(argument);
        }
    }
    return { options, positional };
}

// Expose CLI option types for shared use.
export type { CliOptions, ParsedArguments };
