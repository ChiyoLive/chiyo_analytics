import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

type OfflineCardProps = {
  statusOffline: string;
  statusOfflineDesc: string;
}

export function OfflineCard({
  statusOffline,
  statusOfflineDesc,
}: OfflineCardProps) {
  return (
    <main className="container mx-auto px-4 py-8 flex-1 flex flex-col justify-center items-center max-w-2xl min-h-[60vh]">
      <Card className="border-destructive/50 bg-destructive/5 dark:bg-destructive/10">
        <CardHeader className="flex flex-row items-center gap-3">
          <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
          <CardTitle className="text-destructive font-bold text-lg">
            {statusOffline}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">
          {statusOfflineDesc}
        </CardContent>
      </Card>
    </main>
  );
}
