import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RevenueTable() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["/api/monetization/records"],
  });

  if (isLoading) {
    return <div>Loading revenue...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Records</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left">Date</th>
                <th className="px-2 py-1 text-left">Platform</th>
                <th className="px-2 py-1 text-right">Views</th>
                <th className="px-2 py-1 text-right">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td className="px-2 py-1">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-2 py-1">{r.platform}</td>
                  <td className="px-2 py-1 text-right">{r.views}</td>
                  <td className="px-2 py-1 text-right">${r.earnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
