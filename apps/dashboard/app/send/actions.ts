'use server';

import { publishToQueue } from "@/lib/rabbitmq";


export const sendMail = async (data: any) => {
    try {
        console.log("Sending mail...");
        await publishToQueue(data);
        console.log("Mail sent successfully");
    } catch (error) {
        console.error("Error sending mail:", error);
        throw error;
    }
}