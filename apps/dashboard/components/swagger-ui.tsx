"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: (options: { domNode: HTMLElement; spec: object }) => void;
  }
}

export default function SwaggerUIRenderer({ spec }: { spec: object }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderSwagger = useCallback(() => {
    if (!containerRef.current || !window.SwaggerUIBundle) {
      return;
    }
    containerRef.current.innerHTML = "";
    window.SwaggerUIBundle({
      domNode: containerRef.current,
      spec,
    });
  }, [spec]);

  useEffect(() => {
    renderSwagger();
  }, [renderSwagger]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={renderSwagger}
      />
      <div ref={containerRef} />
    </>
  );
}
