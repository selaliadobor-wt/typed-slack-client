import {
    Project,
    Scope,
    PropertyDeclaration,
    ClassDeclaration,
    WriterFunctions,
    PropertySignature,
    MethodDeclarationStructure,
    FunctionDeclarationStructure,
    NamespaceDeclarationStructure,
    InterfaceDeclaration,
    InterfaceDeclarationStructure,
} from "ts-morph";
import { toCamelCase, filterEmpty, areSameStringIgnoringCase } from "./util";
import { method } from "bluebird";
import * as fs from "fs";
const pathToSlackWebClientArgumentDefinitions = "./node_modules/@slack/web-api/dist/methods.d.ts";
const pathToWebClient = "./node_modules/@slack/web-api/dist/WebClient.d.ts";
type SlackResponseType = {
    name: string;
    method: string;
};

export class Generator {
    outputProject: Project;

    constructor(private typeFilePath: string, private clientFilePath: string) {
        this.outputProject = new Project({
            compilerOptions: { outDir: "dist", declaration: true },
        });
    }

    getSlackWebClientArgumentTypeNames() {
        let slackArgumentsFile = this.outputProject.addExistingSourceFile(pathToSlackWebClientArgumentDefinitions);
        let slackWebClientArgumentTypeNames = slackArgumentsFile
            .getInterfaces()
            .filter(argInterface => argInterface.isExported() && !argInterface.isDefaultExport())
            .map(argInterface => argInterface.getName());
        return slackWebClientArgumentTypeNames;
    }

    generateTypedSlackClient(generatedResponseTypeNames: string[], slackWebClientFunctionPaths: string[]) {
        let slackWebClientArgumentTypeNames = this.getSlackWebClientArgumentTypeNames();
        let slackWebClientResponseTypes: SlackResponseType[] = slackWebClientFunctionPaths.map(member => {
            let typeName = member
                .split(".")
                .map(key => key.charAt(0).toUpperCase() + key.slice(1))
                .join("");
            return {
                name: typeName,
                method: member,
            };
        });

        let missingDefinitions = slackWebClientResponseTypes.filter(
            type => !generatedResponseTypeNames.includes(type.name)
        );
        console.warn(
            `Failed to find the following definitions in the Slack WebClient:`,
            missingDefinitions.map(definition => definition.method)
        );

        let webClientFile = this.outputProject.createSourceFile(
            this.clientFilePath,
            fs
                .readFileSync(pathToWebClient)!
                .toString()
                .replace(new RegExp(`from "./`, "g"), `from "@slack/web-api/dist/`),
            { overwrite: true }
        );

        let webClientClass = webClientFile.getClassOrThrow("WebClient");
        webClientClass.rename("TypedWebClient");
        webClientClass.getConstructors().forEach(constructor => constructor.remove());
        webClientClass.setHasDeclareKeyword(true);

        slackWebClientResponseTypes
            .filter(definition => generatedResponseTypeNames.includes(definition.name))
            .forEach(definition => {
                let possibleArgumentType = definition.name + "Arguments"; //The case may not match, so search for an exact match
                let exactArgumentType = slackWebClientArgumentTypeNames.find(typeName =>
                    areSameStringIgnoringCase(typeName, possibleArgumentType)
                );

                let methodPath = definition.method.split(".").filter(segment => segment !== "");

                let rootProperty: PropertyDeclaration | undefined = undefined;
                while (methodPath.length > 0) {
                    let element = methodPath.shift();
                    if (methodPath.length == 0) {
                        //It was the method, change the return type
                        (<PropertySignature>(
                            rootProperty!.getFirstDescendant(
                                (node: any) => node.getName != undefined && node.getName() == element
                            )
                        ))!.setType(`(options?: ${exactArgumentType}) => Promise<
| (Paths.${definition.name}.Responses.Success 
| Paths.${definition.name}.Responses.Error)>`);
                    } else {
                        if (rootProperty == undefined) {
                            rootProperty = webClientClass.getProperty(element!);
                        } else {
                            rootProperty = <PropertyDeclaration>(
                                rootProperty!.getFirstDescendant(
                                    (node: any) => node.getName != undefined && node.getName() == element
                                )
                            );
                        }
                    }
                }
                if (exactArgumentType == null) {
                    console.warn("Failed to find matching slack arguments for class: ", JSON.stringify(definition));
                    return null;
                }
            });

        webClientFile.addImportDeclaration({
            namedImports: ["WebClient"],
            moduleSpecifier: "@slack/client",
        });
        webClientFile.addImportDeclaration({
            namedImports: slackWebClientArgumentTypeNames,
            moduleSpecifier: "@slack/web-api/dist/methods",
        });
        webClientFile.addImportDeclaration({
            namedImports: ["Paths", "Definitions"],
            moduleSpecifier: "./slackTypes",
        });
        webClientFile.addFunction(this.typedWebClientCreatorMethod).setIsExported(true);
    }

    generateSlackTypeFile(typeDefinitions: string) {
        let typeDefFile = this.outputProject.createSourceFile(this.typeFilePath, typeDefinitions, { overwrite: true });

        typeDefFile
            .getNamespaceOrThrow("Paths")
            .setHasDeclareKeyword(false)
            .setIsExported(true)
            .getNamespaces()
            .forEach(nameSpace => {
                let responsesNamespace = nameSpace.setIsExported(true).getNamespaceOrThrow("Responses");

                responsesNamespace.setIsExported(true);
                let error = responsesNamespace.getInterface("Error");
                if (error != null) {
                    let indexSignature = error.getIndexSignature(() => true);
                    if (indexSignature) {
                        indexSignature.remove();
                    }
                    let okValue = error.getProperty("ok");
                    if (okValue != undefined) {
                        okValue.set({ type: "Definitions.OkFalse" });
                    }
                    error.addProperty({
                        name: "response_metadata",
                        type: "string | object | undefined",
                    });
                }
            });

        typeDefFile
            .getNamespaceOrThrow("Definitions")
            .setHasDeclareKeyword(false)
            .setIsExported(true);

        typeDefFile
            .getNamespaceOrThrow("Definitions")
            .getTypeAlias("OkFalse")!
            .set({ type: "false" });
        typeDefFile
            .getNamespaceOrThrow("Definitions")
            .getTypeAlias("OkTrue")!
            .set({ type: "true" });

        let additionalTypeDefFile = this.outputProject.addExistingSourceFile("./additionalSlackTypes.ts");

        let additionalPathNamespace = additionalTypeDefFile.getNamespace("Paths");

        let additionalPaths =
            additionalPathNamespace == null
                ? []
                : additionalPathNamespace.getNamespaces().map(namespace => namespace.getStructure());

        typeDefFile.getNamespaceOrThrow("Paths").addNamespaces(additionalPaths);

        let additionalDefinitionNamespace = additionalTypeDefFile.getNamespace("Definitions");

        let additionalDefinitions =
            additionalDefinitionNamespace == null
                ? []
                : additionalDefinitionNamespace.getNamespaces().map(namespace => namespace.getStructure());

        typeDefFile.getNamespaceOrThrow("Definitions").addNamespaces(additionalDefinitions);

        return typeDefFile;
    }

    private readonly typedWebClientCreatorMethod: FunctionDeclarationStructure = {
        name: "createTypedSlackWebClient",
        returnType: "TypedWebClient",
        parameters: [
            {
                type: "string",
                name: "token",
                hasQuestionToken: true,
            },
            {
                type: "WebClientOptions",
                name: `{
    slackApiUrl,
    logger,
    logLevel,
    maxRequestConcurrency,
    retryConfig,
    agent,
    tls,
    rejectRateLimitedCalls,
    headers,
}`,
                initializer: "{}",
            },
        ],
        bodyText: `return <any>new WebClient(token, {
    slackApiUrl,
    logger,
    logLevel,
    maxRequestConcurrency,
    retryConfig,
    agent,
    tls,
    rejectRateLimitedCalls,
    headers,
})`,
    };

    async save() {
        await this.outputProject.save();
    }
}
