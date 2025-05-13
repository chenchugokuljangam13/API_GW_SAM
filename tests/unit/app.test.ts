import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { chatHandler } from '../../chat-app/app';
import { expect, describe, it } from '@jest/globals';
import {mockClient} from 'aws-sdk-client-mock';
process.env.TableName = 'test-table';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
const ddbMock = mockClient(DynamoDBDocumentClient);
const apiMock = mockClient(ApiGatewayManagementApiClient);
const event: APIGatewayProxyEvent = {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: '',
    isBase64Encoded: false,
    path: '',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
        accountId: '',
        apiId: '',
        authorizer: undefined,
        protocol: '',
        httpMethod: '',
        identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '',
            user: null,
            userAgent: null,
            userArn: null
        },
        path: '',
        stage: '',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: ''
    },
    resource: ''
};
describe('Unit test for app handler', function () {
    beforeEach(() => {
        ddbMock.reset();
        apiMock.reset();
    });
    test('verifies response when different route is given', async () => {
        event.requestContext.routeKey = 'ftgyhuj';
        const result: APIGatewayProxyResult = await chatHandler(event);
        expect(result.statusCode).toEqual(400);
        expect(result.body).toEqual(`Unknown route: ${event.requestContext.routeKey}`);
    });
    test('verifies response no route is given', async () => {
        event.requestContext.routeKey = '$default';
        const result: APIGatewayProxyResult = await chatHandler(event);
        expect(result.statusCode).toEqual(200);
        expect(result.body).toEqual(`Not given Proper action so it hit default`);
    });
    test('verifies response for connect route', async() => {
        ddbMock.on(PutCommand).resolves({});
        event.requestContext.routeKey = '$connect';
        event.requestContext.connectionId = 'abcd';
        event.requestContext.domainName = 'sdfs';
        event.requestContext.stage = 'dev';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual("Connection established");
    });
    test('verifies response for connect route fails', async() => {
        ddbMock.on(PutCommand).rejects(new Error('failed to connect'));
        event.requestContext.routeKey = '$connect';
        event.requestContext.connectionId = 'abcd';
        event.requestContext.domainName = 'sdfs';
        event.requestContext.stage = 'dev';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(400);
        expect(result.body).toEqual("Failed to establish connection");
    });
    test('verifies response for register route', async() => {
        ddbMock.on(PutCommand).resolves({});
        event.requestContext.routeKey = 'register';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual("Group registered");
    });
    test('verifies response for register route fails', async() => {
        ddbMock.on(PutCommand).rejects(new Error('Failed to register group'));
        event.requestContext.routeKey = 'register';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(400);
        expect(result.body).toEqual("Failed to register group");
    });
    test('verifies connection', async() => {
        ddbMock.on(ScanCommand).resolves({});
        event.requestContext.routeKey = 'sendMessage';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual("No active connections in the group");
    });
    test('verifies failure for sendMessage route when PostToConnectionCommand fails', async() => {
        ddbMock.on(ScanCommand).resolves({
            Items: [{ connectionID: 'conn1', groupId: 'A' }]
        });
        apiMock.on(PostToConnectionCommand).rejects(new Error('failed to post to connectionId'));
        event.requestContext.routeKey = 'sendMessage';
        event.body = JSON.stringify({
            groupId: 'A'
        })
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(400);
        expect(result.body).toEqual("Failed to send message to ConnectionID");
    });
    test('verifies response for sendMessage route', async() => {
        ddbMock.on(ScanCommand).resolves({
            Items: [{ connectionID: 'conn1', groupId: 'A' }]
        });
        apiMock.on(PostToConnectionCommand).resolves({})
        event.requestContext.routeKey = 'sendMessage';
        event.body = JSON.stringify({
            groupId: 'A',
            message: 'hi'
        })
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual("Message broadcasted");
    });
    
    test('verifies response for disconnect route', async() => {
        ddbMock.on(DeleteCommand).resolves({});
        event.requestContext.routeKey = '$disconnect';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual("Disconnected successfully");
    });
    test('verifies response for disconnect route failure', async() => {
        ddbMock.on(DeleteCommand).rejects(new Error('failed while disconnecting'));
        event.requestContext.routeKey = '$disconnect';
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(500);
        expect(result.body).toEqual("Error during disconnect");
    });
    test('unhandled error - returns 500', async () => {
        const event = {
            requestContext: {
            routeKey: 'sendMessage',
            connectionId: 'conn1',
            domainName: 'example.com',
            stage: 'dev'
            },
            body: '{ invalid JSON'
        } as any;
        const result = await chatHandler(event);
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({
            message: 'Internal server error'
        });
    });
});
