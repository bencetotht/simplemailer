'use client';

import { Button } from "@/components/ui/button";
import { LogTable } from "@/components/logTable";
import { getMessages } from "./actions";
import { useEffect, useState } from "react";
import prisma from "@/lib/prisma";

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);

  const getLogs = async () => {
    const logs = await prisma.log.findMany();
    console.log(logs);
    // setLogs(logs);
  }

  const getInformation = async () => {
    const messages = await getMessages();
    setMessages(messages);
  }

  useEffect(() => {
    getInformation();
  }, []);

  return (
    <div>
      <h1>Simple Mailer</h1>
      <LogTable data={messages} />
    </div>
  );
}
