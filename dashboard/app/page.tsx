'use client';

import { Button } from "@/components/ui/button";
import { LogTable } from "@/components/logTable";
import { getMessages } from "./actions";
import { useEffect, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);

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
