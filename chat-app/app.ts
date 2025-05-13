import { APIGatewayProxyEvent,APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import {putCommandHelper, getDataHelperFunction, deleteCommandHelperFunction} from './HelpersFunctions/ddbHelperFunction';
const tableName = process.env.TableName!;

export const chatHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('event:', event);
    const connectionId = event.requestContext.connectionId as string;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const routeKey = event.requestContext.routeKey;
    // allows you to directly manage the runtime aspects   
    const clientAPI = new ApiGatewayManagementApiClient({
        apiVersion: '2018-11-29',
        endpoint: `https://${domainName}/${stage}`
    });
    try {
        switch (routeKey) {
        // route for connecting to websocket
        case '$connect': {
            const { groupId: connectGroupId } = JSON.parse(event.body || '{}');
            const item = {
                connectionID: connectionId,
                groupId: connectGroupId
            }
            // add item(connectionId, in table) in table
            try{
                await putCommandHelper(tableName, item);
                return {
                    statusCode: 200,
                    body: "Connection established"
                };
            } catch(err) {
                return {
                    statusCode: 400,
                    body: "Failed to establish connection"
                }
            }
        }
        // route for register to a group
        case 'register': {
            const { groupId: newGroupId } = JSON.parse(event.body || '{}');
            const item = {
                connectionID: connectionId,
                groupId: newGroupId
            }
            // for storing group id in db
            try {
                await putCommandHelper(tableName, item)
                return {
                    statusCode: 200,
                    body: "Group registered"
                };
            } catch(err) {
                return {
                    statusCode: 400,
                    body: "Failed to register group"
                }
            }
        }
        // route for sending message
        case 'sendMessage': {
            const { groupId , message } = JSON.parse(event.body || '{}');
            const connectionsInGroup = await getDataHelperFunction(tableName, groupId);
            if (!connectionsInGroup || connectionsInGroup.length === 0) {
                return {
                    statusCode: 200,
                    body: "No active connections in the group"
                };
            }
            try{
                // scans table from db and stored in data variable
                for (const { connectionID } of connectionsInGroup) {
                    await clientAPI.send(new PostToConnectionCommand({
                        ConnectionId: connectionID,
                        Data: message
                    }));
                    console.log("message send to ", connectionID)
                }
                return {
                    statusCode: 200,
                    body: "Message broadcasted"
                }
            } catch (error) {
                console.log(error)
                return {
                    statusCode: 400,
                    body: "Failed to send message to ConnectionID"
                }
            };
        }    
        // route for disconnecting from websocket
        case '$disconnect': {
            try {
            // deletes item in table
            await deleteCommandHelperFunction(tableName, connectionId);
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
            };
        }
        // route for default route if no route is mentioned
        case '$default': {
            return {
            statusCode: 200,
            body: "Not given Proper action so it hit default"
            };
        }
        // throws error if some other action is given
        default: {
            return {
            statusCode: 400,
            body: `Unknown route: ${routeKey}`
            };
        }
        }
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error'
            })
        };
    }
};
