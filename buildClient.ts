import dtsGenerator, { DefaultTypeNameConvertor, SchemaId } from "dtsgenerator";
import * as request from "request-promise";
import { WebClient } from "@slack/client";
import { iterate } from "./util";
import { Generator } from "./generator";

const slackApiDocUrl =
    "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json";

const pathToSlackTypeTs = "dist/slackTypes.ts";
const pathToSlackClientTs = "dist/typedSlackWebClient.ts";

const slackOpenApiNameSubstitutions = { $200: "Success", Default: "Error" };

function typeNameConvertor(id: SchemaId): string[] {
    let names = DefaultTypeNameConvertor(id);
    if (names.length > 0) {
        const lastIndex = names.length - 1;
        names[lastIndex] = names[lastIndex];
    }
    names = names.map(name => {
        name = name.startsWith("Defs") ? name.replace("Defs", "") : name;
        name = name.startsWith("Objs") ? name.replace("Objs", "") : name;
        return Object.keys(slackOpenApiNameSubstitutions).includes(name)
            ? (<any>slackOpenApiNameSubstitutions)[name]
            : name;
    });
    return names;
}

async function main(): Promise<void> {
    let generator: Generator = new Generator(pathToSlackTypeTs, pathToSlackClientTs);
    console.info(`Downloading Slack API docs from ${slackApiDocUrl}`);
    let slackApiDoc = await request.get(slackApiDocUrl, { json: true });
    console.info(`Downloaded Slack API docs successfully`);

    console.info(`Generating Typescript definitions from docs`);
    const slackApiDocDtsDefinitions = await dtsGenerator({
        contents: [slackApiDoc],
        typeNameConvertor,
    });
    console.info(`Generated Typescript definitions from docs successfully`);

    console.info(`Generating Typescript types`);
    let generatedResponseTypeTsFile = generator.generateSlackTypeFile(slackApiDocDtsDefinitions);

    console.info(`Generated Typescript types successfully`);

    console.info(`Generating Client`);

    let generatedResponseTypeNames = generatedResponseTypeTsFile
        .getNamespaceOrThrow("Paths")
        .getNamespaces()
        .map(namespace => namespace.getName());

    let slackWebClientFunctionPaths = iterate(new WebClient(), property => typeof property == "function");

    generator.generateTypedSlackClient(generatedResponseTypeNames, slackWebClientFunctionPaths);

    console.info(`Generated Client successfully`);
    console.info(`Saving output to ./dist`);
    await generator.save();

    console.info(`Saved output to ./dist`);
    console.info(`Complete.`);
}

main();
