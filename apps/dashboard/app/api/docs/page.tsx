import { getApiDocs } from "@/lib/swagger";
import SwaggerUIRenderer from "@/components/swagger-ui";

export const metadata = {
  title: "SimpleMailer API Docs",
};

export default function ApiDocsPage() {
  const spec = getApiDocs();
  return (
    <div className="h-full overflow-auto bg-white">
      <SwaggerUIRenderer spec={spec} />
    </div>
  );
}
