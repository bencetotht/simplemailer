'use server';

import { peekAtQueue } from "@/lib/rabbitmq";

export const getMessages = async () => {
    return await peekAtQueue();
}
