# Typed Slack Client Generator

Generates detailed types for Slack WebClient interface based on Slack's OpenAPI V2 specifications

# Usage

Results of code generation are published to npm as `typed-slack-client`
npm install typed-slack-client
Import the creation method and types:

    import { createTypedSlackWebClient } from  "typed-slack-client/typedSlackWebClient";
    import { Definitions } from  "typed-slack-client/slackTypes";

Create a client (`yourToken` can be undefined):

    const  slack  =  createTypedSlackWebClient(yourToken, {
    	logLevel:  LogLevel.DEBUG
    });

Use the client:

    //Client mirrors default Slack client API

    let  listResponse  =  await slack.users.list({ token: token });

    //listResponse will be a union of a Success type and an Error type
    //Check response.ok to tell if the call was successful

    if(listResponse.ok){
    	//Here listResponse is an success type, listResponse.error will not be defined and will not be autocompleted

    	console.log(listResponse.members)
    }else{
    	//Here listResponse is an error type, listResponse.members will not be defined and will not be autocompleted

    	console.log(listResponse.error)
    }

`createTypedSlackWebClient` accepts the same arguments as the default `WebClient` constructor in the offical Slack client library, `@slack/client`

## Generate client definitions

Run `npm run-script build` from the top level project and a set of definitions will be generated in the `dist` folder.

This operation requires network connectivity, to download the latest API definition

## Missing Type Definitions

Slack's Open API definitions are out of date. This means several types will not be included.

Success types include an index signature allowing them to return any fields.

Error types do no include an index signature, please create an issue if there are missing error fields.
