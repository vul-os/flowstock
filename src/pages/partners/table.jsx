import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context/workspace-context";

export const PartnersTable = ({ data, type, onEdit, onDelete }) => {
  const { fmtMoney } = useWorkspace();
  const isCustomer = type === "customer";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>{isCustomer ? "Credit Limit" : "Payment Terms"}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={6}
              className="text-center text-muted-foreground"
            >
              No {isCustomer ? "customers" : "suppliers"} yet.
            </TableCell>
          </TableRow>
        )}
        {data.map((partner) => (
          <TableRow key={partner.id}>
            <TableCell className="font-medium">{partner.name}</TableCell>
            <TableCell>{partner.company_name}</TableCell>
            <TableCell>
              <div className="space-y-1">
                <div>{partner.email}</div>
                <div className="text-sm text-muted-foreground">
                  {partner.phone}
                </div>
              </div>
            </TableCell>
            <TableCell>
              {isCustomer
                ? partner.credit_limit
                  ? fmtMoney(partner.credit_limit)
                  : "-"
                : partner.payment_terms}
            </TableCell>
            <TableCell>
              <Badge variant={partner.is_active ? "default" : "secondary"}>
                {partner.is_active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(partner)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(partner)}
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
