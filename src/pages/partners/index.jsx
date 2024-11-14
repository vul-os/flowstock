import React, { useState, useEffect } from 'react';
import { Plus, Users, Building2, Search } from 'lucide-react';
import { supabase } from '@/services/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { PartnersTable } from './table';
import { PartnerDialog } from './dialog';
import { StatsCards } from './stats';

const PartnersPage = ({ organizationId }) => {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerType, setPartnerType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPartners = async () => {
    try {
      setIsLoading(true);
      const [customersResponse, suppliersResponse] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('organization_id', organizationId),
        supabase
          .from('suppliers')
          .select('*')
          .eq('organization_id', organizationId)
      ]);

      if (customersResponse.error) throw customersResponse.error;
      if (suppliersResponse.error) throw suppliersResponse.error;

      setCustomers(customersResponse.data || []);
      setSuppliers(suppliersResponse.data || []);
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [organizationId]);

  const handleCreatePartner = (type) => {
    setSelectedPartner(null);
    setPartnerType(type);
    setDialogOpen(true);
  };

  const handleEditPartner = (partner, type) => {
    setSelectedPartner(partner);
    setPartnerType(type);
    setDialogOpen(true);
  };

  const handleSubmitPartner = async (partnerData, table) => {
    try {
      if (selectedPartner) {
        const { error } = await supabase
          .from(table)
          .update(partnerData)
          .eq('id', selectedPartner.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .insert([partnerData]);
        if (error) throw error;
      }
      await fetchPartners();
    } catch (error) {
      console.error('Error saving partner:', error);
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Partners</h1>
          <p className="text-muted-foreground mt-2">
            Manage your customers and suppliers
          </p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search partners..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <StatsCards customersCount={customers.length} suppliersCount={suppliers.length} />

      <Tabs defaultValue="customers" className="space-y-4">
        <div className="flex justify-between">
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button onClick={() => handleCreatePartner('customer')} variant={partnerType === 'suppliers' ? 'outline' : 'default'}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
            <Button onClick={() => handleCreatePartner('supplier')} variant={partnerType === 'customers' ? 'outline' : 'default'}>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </div>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
              <CardDescription>Manage your customer relationships</CardDescription>
            </CardHeader>
            <CardContent>
              <PartnersTable
                data={filteredCustomers}
                type="customer"
                onEdit={(partner) => handleEditPartner(partner, 'customer')}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Suppliers</CardTitle>
              <CardDescription>Manage your supplier relationships</CardDescription>
            </CardHeader>
            <CardContent>
              <PartnersTable
                data={filteredSuppliers}
                type="supplier"
                onEdit={(partner) => handleEditPartner(partner, 'supplier')}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PartnerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        partner={selectedPartner}
        type={partnerType}
        organizationId={organizationId}
        onSubmit={handleSubmitPartner}
      />
    </div>
  );
};

export default PartnersPage;