import { LiveScreeningSurveyClient } from "@/components/live-screening-survey-client";

export default async function LiveScreeningSurveyPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LiveScreeningSurveyClient token={token} />;
}
