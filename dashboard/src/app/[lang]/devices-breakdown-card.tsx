import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardClientTrans } from "./page";
import { Laptop } from "lucide-react";

type CountItem = {
  name: string;
  count: number;
};

type DevicesData = {
  device_types: CountItem[];
  operating_systems: CountItem[];
  browsers: CountItem[];
  countries: CountItem[];
};

type DevicesBreakdownCardProps = {
  devices: DevicesData | undefined;
  trans: DashboardClientTrans;
};

export function DevicesBreakdownCard({
  devices,
  trans,
}: DevicesBreakdownCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Laptop className="h-4 w-4 text-orange-500" />
          {trans["dashboard:devices_breakdown"]}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {/* Devices & Browsers columns */}
        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            {trans["dashboard:device_types"]}
          </h4>
          <ul className="space-y-1">
            {devices?.device_types && devices.device_types.length > 0 ? (
              devices.device_types.slice(0, 4).map((dev, idx) => (
                <li key={idx} className="text-sm flex justify-between">
                  <span className="capitalize">{dev.name}</span>
                  <span className="font-semibold text-muted-foreground">
                    {dev.count}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No data</li>
            )}
          </ul>

          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
            {trans["dashboard:browsers"]}
          </h4>
          <ul className="space-y-1">
            {devices?.browsers && devices.browsers.length > 0 ? (
              devices.browsers.slice(0, 4).map((browser, idx) => (
                <li key={idx} className="text-sm flex justify-between">
                  <span>{browser.name}</span>
                  <span className="font-semibold text-muted-foreground">
                    {browser.count}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No data</li>
            )}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            {trans["dashboard:operating_systems"]}
          </h4>
          <ul className="space-y-1">
            {devices?.operating_systems &&
            devices.operating_systems.length > 0 ? (
              devices.operating_systems.slice(0, 4).map((os, idx) => (
                <li key={idx} className="text-sm flex justify-between">
                  <span>{os.name}</span>
                  <span className="font-semibold text-muted-foreground">
                    {os.count}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No data</li>
            )}
          </ul>

          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
            {trans["dashboard:countries"]}
          </h4>
          <ul className="space-y-1">
            {devices?.countries && devices.countries.length > 0 ? (
              devices.countries.slice(0, 4).map((country, idx) => (
                <li key={idx} className="text-sm flex justify-between">
                  <span>{country.name}</span>
                  <span className="font-semibold text-muted-foreground">
                    {country.count}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No data</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
