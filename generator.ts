import { Project, Scope, MethodDeclarationStructure } from "ts-morph";
import { toCamelCase, filterEmpty, areSameStringIgnoringCase } from "./util";
const pathToSlackWebClientArgumentDefinitions = "./node_modules/@slack/web-api/dist/methods.d.ts";

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

    public generateSlackClientFile(generatedResponseTypeNames: string[], slackWebClientFunctionPaths: string[]) {
        let methods = this.getMethodDeclerationsForSlackTypes(generatedResponseTypeNames, slackWebClientFunctionPaths);
        let slackWebClientArgumentTypeNames = this.getSlackWebClientArgumentTypeNames();
        let clientFile = this.outputProject.createSourceFile(this.clientFilePath);
        let clientClass = clientFile.addClass({ name: "SlackTypedClient" });
        clientClass.addMethods(methods);
        clientClass.addProperty({ type: "WebClient", name: "slack" });
        clientClass
            .addConstructor({
                parameters: [{ type: "WebClient", name: "slack" }],
            })
            .setBodyText("this.slack = slack");
        clientFile.addImportDeclaration({
            namedImports: ["WebClient"],
            moduleSpecifier: "@slack/client",
        });
        clientFile.addImportDeclaration({
            namedImports: slackWebClientArgumentTypeNames,
            moduleSpecifier: "@slack/web-api/dist/methods",
        });
        clientFile.addImportDeclaration({
            namedImports: ["Paths", "Definitions"],
            moduleSpecifier: "./slackTypes",
        });
        return clientFile;
    }

    getSlackWebClientArgumentTypeNames() {
        let slackArgumentsFile = this.outputProject.addExistingSourceFile(pathToSlackWebClientArgumentDefinitions);
        let slackWebClientArgumentTypeNames = slackArgumentsFile
            .getInterfaces()
            .filter(argInterface => argInterface.isExported() && !argInterface.isDefaultExport())
            .map(argInterface => argInterface.getName());
        return slackWebClientArgumentTypeNames;
    }

    getMethodDeclerationsForSlackTypes(generatedResponseTypeNames: string[], slackWebClientFunctionPaths: string[]) {
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

        return slackWebClientResponseTypes
            .filter(definition => generatedResponseTypeNames.includes(definition.name))
            .map(definition => {
                let possibleArgumentType = definition.name + "Arguments"; //The case may not match, so search for an exact match
                let exactArgumentType = slackWebClientArgumentTypeNames.find(typeName =>
                    areSameStringIgnoringCase(typeName, possibleArgumentType)
                );

                if (exactArgumentType == null) {
                    console.warn("Failed to find matching slack arguments for class: ", JSON.stringify(definition));
                    return null;
                }

                return {
                    name: toCamelCase(definition.name),
                    parameters: [{ name: "args", type: exactArgumentType }],
                    returnType: `Promise<
| (Paths.${definition.name}.Responses.Success 
| Paths.${definition.name}.Responses.Error) 
& Paths.${definition.name}.Responses.SuccessOrErrorPredicate>`,
                    isAsync: true,
                    bodyText: `let response = <any>await this.slack${definition.method}(args);
response["isSuccess"] = new Paths.AuthTest.Responses.SuccessOrErrorPredicate(response).isSuccess();
return response;`,
                };
            })
            .filter(filterEmpty);
    }

    generateSlackTypeFile(typeDefinitions: string) {
        let typeDefFile = this.outputProject.createSourceFile(this.typeFilePath, typeDefinitions);
        typeDefFile
            .getNamespaceOrThrow("Paths")
            .setHasDeclareKeyword(false)
            .setIsExported(true)
            .getNamespaces()
            .forEach(nameSpace => {
                let responsesNamespace = nameSpace.setIsExported(true).getNamespaceOrThrow("Responses");
                let predicateClasss = responsesNamespace
                    .setIsExported(true)
                    .addClass({ name: "SuccessOrErrorPredicate", isExported: true });
                predicateClasss
                    .addConstructor({
                        parameters: [{ scope: Scope.Private, name: "response", type: "Success | Error" }],
                    })
                    .setBodyText("");
                predicateClasss
                    .addMethod({
                        name: "isSuccess",
                        returnType: "this is Success",
                    })
                    .setBodyText("return JSON.parse((<Error>this.response).ok) == false;");
                let success = responsesNamespace.getInterface("Success");
                if (success != null) {
                    let indexSignature = success.getIndexSignature(() => true);
                    if (indexSignature) {
                        indexSignature.remove();
                    }
                }
                let error = responsesNamespace.getInterface("Error");
                if (error != null) {
                    let indexSignature = error.getIndexSignature(() => true);
                    if (indexSignature) {
                        indexSignature.remove();
                    }
                }
            });

        typeDefFile
            .getNamespaceOrThrow("Definitions")
            .setHasDeclareKeyword(false)
            .setIsExported(true);
        return typeDefFile;
    }
    async save() {
        await this.outputProject.save();
    }
}
