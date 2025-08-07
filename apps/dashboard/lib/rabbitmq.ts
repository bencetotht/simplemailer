import amqp from 'amqplib';

let channel: amqp.Channel;

export const getChannel = async () => {
    try {
        if (channel) return channel;
        const connection = await amqp.connect('amqp://root:root@localhost:5672');
        channel = await connection.createChannel();
        await channel.assertQueue('mailer', { durable: true });
        return channel;
    } catch (error) {
        console.error("Error connecting to RabbitMQ:", error);
        throw error;
    }
}

export const publishToQueue = async (data: any) => {
    try {
        const channel = await getChannel();
        const sendData = {
            pattern: "mail.send",
            data: data
        };
        await channel.sendToQueue('mailer', Buffer.from(JSON.stringify(sendData)), { persistent: true });
        console.log("Message sent to queue 'mailer' for @MessagePattern");
    } catch (error) {
        console.error("Error publishing to queue:", error);
        throw error;
    }
}

export const peekAtQueue = async () => {
    const auth = Buffer.from('root:root').toString('base64');
    const response = await fetch('http://localhost:15672/api/queues/%2f/mailer/get', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: 10,
          ackmode: 'ack_requeue_true',
          encoding: 'auto',
          truncate: 50000,
        }),
      });
    const messages = await response.json();
    return messages;
}