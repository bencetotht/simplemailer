'use client';

import { Button } from "@/components/ui/button";
import { sendMail } from "./actions";
import { useState } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const triggerMail = async () => {
      setIsLoading(true);
      setError(null);
      setSuccess(false);
      
      try {
          await sendMail({
              to: 'test@test.com',
              subject: 'Test Mail',
              text: 'This is a test mail',
          });
          setSuccess(true);
          console.log("Mail sent successfully from frontend");
      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
          setError(errorMessage);
          console.error("Error in frontend:", err);
      } finally {
          setIsLoading(false);
      }
  }

  return (
  <div>
      <h1>Simple Mailer</h1>
      <Button 
          onClick={triggerMail} 
          disabled={isLoading}
          style={{ marginTop: '10px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
      >
          {isLoading ? 'Sending...' : 'Send Mail'}
      </Button>
      
      {error && (
          <div style={{ marginTop: '10px', color: 'red' }}>
              Error: {error}
          </div>
      )}
      
      {success && (
          <div style={{ marginTop: '10px', color: 'green' }}>
              Mail sent successfully!
          </div>
      )}
  </div>
  );
}
