/**
 * This file is merged with the generated types in slackTypes.ts
 */

export namespace Paths {
    //Namespace mapping pattern:    api.test => ApiTest
    //                              chat.update => ChatUpdate
    //                              some.example.call => SomeExampleCall
    export namespace DndInfo {
        export namespace Responses {
            export interface Success {
                //Add additional fields to success type
                dnd_enabled?: boolean;
                next_dnd_start_ts?: number;
                next_dnd_end_ts?: number;
                snooze_enabled?: boolean;
                snooze_endtime?: number;
                snooze_remaining?: number;
            }
            export interface Error {
                //Add additional fields to error type
            }
        }
    }
}

export namespace Definitions {
    export namespace SlashCommands {
        interface RequestBody {
            token: string;
            team_id: string;
            team_domain: string;
            enterprise_id: string;
            enterprise_name: string;
            channel_id: string;
            channel_name: string;
            user_id: string;
            user_name: string;
            command: string;
            text: string;
            response_url: string;
            trigger_id: string;
        }
    }

    export namespace InteractiveActions {
        export interface Payload {
            type: string;
            actions: PayloadAction[];
            callback_id: string;
            team: PayloadTeam;
            channel: PayloadChannel;
            user: PayloadChannel;
            action_ts: string;
            message_ts: string;
            attachment_id: string;
            token: string;
            original_message: PayloadOriginalmessage;
            response_url: string;
            trigger_id: string;
        }

        export interface PayloadOriginalmessage {
            text: string;
            attachments: PayloadAttachment[];
        }

        export interface PayloadAttachment {
            title: string;
            fields?: PayloadField[];
            author_name?: string;
            author_icon?: string;
            image_url?: string;
            text?: string;
            fallback?: string;
            callback_id?: string;
            color?: string;
            attachment_type?: string;
            actions?: PayloadOriginalMessageAction[];
        }

        export interface PayloadOriginalMessageAction {
            name: string;
            text: string;
            type: string;
            value: string;
        }

        export interface PayloadField {
            title: string;
            value: string;
            short: boolean;
        }

        export interface PayloadChannel {
            id: string;
            name: string;
        }

        export interface PayloadTeam {
            id: string;
            domain: string;
        }

        export interface PayloadAction {
            selected_option: any | null;
            block_id: any;
            name: string;
            value: string;
            type: string;
        }
    }
}
