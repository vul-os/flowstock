import React, { useState, useEffect, useContext } from 'react';
import { supabase } from '@/services/supabaseClient';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthContext } from "@/context/use-auth";

const CreditorsDebtorsPage = () => {
  const { activeOrganization } = useContext(AuthContext);
  const [parties, setParties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totals, setTotals] = useState({
    totalCreditors: 0,
    totalDebtors: 0
  });

  useEffect(() => {
    if (activeOrganization?.id) {
      fetchParties();
    }
  }, [activeOrganization]);

  const fetchParties = async () => {
    try {
      const { data, error } = await supabase
        .from('party_balances')
        .select('*')
        .eq('organization_id', activeOrganization.id)
        .order('name');

      if (error) throw error;

      // Calculate totals
      const totalCreditors = data
        .filter(p => p.balance > 0)
        .reduce((sum, p) => sum + Number(p.balance), 0);
      
      const totalDebtors = data
        .filter(p => p.balance < 0)
        .reduce((sum, p) => sum + Math.abs(Number(p.balance)), 0);

      setParties(data);
      setTotals({ totalCreditors, totalDebtors });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch data: " + error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(totals.totalCreditors)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Receivable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totals.totalDebtors)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts Payable & Receivable</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="creditors">
            <TabsList>
              <TabsTrigger value="creditors">Creditors</TabsTrigger>
              <TabsTrigger value="debtors">Debtors</TabsTrigger>
            </TabsList>
            
            <TabsContent value="creditors">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties
                    .filter(party => party.balance > 0)
                    .map((party) => (
                      <TableRow key={party.id}>
                        <TableCell className="font-medium">{party.name}</TableCell>
                        <TableCell>{party.party_type === 'supplier' ? 'Supplier' : 'Customer'}</TableCell>
                        <TableCell>
                          {party.email}<br/>
                          {party.phone}
                        </TableCell>
                        <TableCell>{party.payment_terms}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(party.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="debtors">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties
                    .filter(party => party.balance < 0)
                    .map((party) => (
                      <TableRow key={party.id}>
                        <TableCell className="font-medium">{party.name}</TableCell>
                        <TableCell>{party.party_type === 'supplier' ? 'Supplier' : 'Customer'}</TableCell>
                        <TableCell>
                          {party.email}<br/>
                          {party.phone}
                        </TableCell>
                        <TableCell>{party.payment_terms}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(Math.abs(party.balance))}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditorsDebtorsPage;