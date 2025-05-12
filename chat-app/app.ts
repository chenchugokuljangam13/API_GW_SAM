import { APIGatewayProxyEvent,APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDB({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.TableName!;

export const chatHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log('event:', event);

    const { connectionId, domainName, stage, routeKey } = event.requestContext as any;

    // allows you to directly manage the runtime aspects   
    const clientAPI = new ApiGatewayManagementApiClient({
        apiVersion: '2018-11-29',
        endpoint: `https://${domainName}/${stage}`
    });

    try {
        switch (routeKey) {
        case '$connect': {
            const { groupId: connectGroupId } = JSON.parse(event.body || '{}');
            await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: {
                connectionID: connectionId,
                groupId: connectGroupId
            }
            }));
            return {
            statusCode: 200,
            body: "Connection established"
            };
        }

        case 'register': {
            const { groupId: newGroupId } = JSON.parse(event.body || '{}');
            await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: {
                connectionID: connectionId,
                groupId: newGroupId
            }
            }));
            return {
            statusCode: 200,
            body: "Group registered"
            };
        }

        case 'sendMessage': {
            const { groupId, message } = JSON.parse(event.body || '{}');

            const data = await ddbDocClient.send(new ScanCommand({
            TableName: tableName
            }));

            const connectionsInGroup = (data.Items || []).filter(
            (item) => item.groupId === groupId
            );

            const sendPromises = connectionsInGroup.map(async ({ connectionID }) => {
            try {
                await clientAPI.send(new PostToConnectionCommand({
                ConnectionId: connectionID,
                Data: message
                }));
            } catch (err) {
                console.error(`Failed to send message to ${connectionID}:`, err);
            }
            });

            await Promise.all(sendPromises);

            return {
            statusCode: 200,
            body: "Message broadcasted"
            };
        }

        case '$disconnect': {
            try {
            await ddbDocClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { connectionID: connectionId }
            }));
            return {
                statusCode: 200,
                body: "Disconnected successfully"
            };
            } catch (err) {
            console.error("Error during disconnect:", err);
            return {
                statusCode: 500,
                body: "Error during disconnect"
            };
            }
        }

        case '$default': {
            return {
            statusCode: 200,
            body: "Not given Proper action so it hit default"
            };
        }

        default: {
            return {
            statusCode: 400,
            body: `Unknown route: ${routeKey}`
            };
        }
        }
    } catch (err) {
        console.error("Unhandled error:", err);
        return {
        statusCode: 500,
        body: JSON.stringify({
            message: 'Internal server error',
            error: (err as Error).message
        })
        };
    }
};
