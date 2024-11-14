import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
    }).format(amount).replace('ZAR', 'R');
};

export const PartnersTable = ({ data, type, onEdit }) => {
    const isCustomer = type === 'customer';
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>{isCustomer ? 'Credit Limit' : 'Payment Terms'}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((partner) => (
            <TableRow key={partner.id}>
              <TableCell className="font-medium">{partner.name}</TableCell>
              <TableCell>{partner.company_name}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div>{partner.email}</div>
                  <div className="text-sm text-muted-foreground">{partner.phone}</div>
                </div>
              </TableCell>
              <TableCell>
                {isCustomer 
                  ? (partner.credit_limit ? formatCurrency(partner.credit_limit) : '-')
                  : partner.payment_terms}
              </TableCell>
              <TableCell>
                <Badge variant={partner.is_active ? "success" : "secondary"}>
                  {partner.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onEdit(partner)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };