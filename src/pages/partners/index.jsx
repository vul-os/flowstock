import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "@/services/api";
import { useTables } from "@/context/workspace-context";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PartnersTable } from "./table";
import { PartnerDialog } from "./dialog";
import { StatsCards } from "./stats";

const PartnersPage = () => {
  const { data, loading } = useTables("customers", "suppliers");
  const customers = data.customers || [];
  const suppliers = data.suppliers || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerType, setPartnerType] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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
      await api.putRow(table, selectedPartner?.id || null, partnerData);
      toast({
        title: selectedPartner ? "Partner updated" : "Partner created",
        description: `${partnerData.name} was saved.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to save partner: ${error.message || error}`,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeletePartner = async (partner, type) => {
    const table = type === "customer" ? "customers" : "suppliers";
    if (!window.confirm(`Delete ${partner.name}? This cannot be undone.`))
      return;
    try {
      await api.deleteRow(table, partner.id);
      toast({
        title: "Partner deleted",
        description: `${partner.name} was removed.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete partner: ${error.message || error}`,
        variant: "destructive",
      });
    }
  };

  const matches = (p) =>
    (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.company_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.email || "").toLowerCase().includes(searchTerm.toLowerCase());

  const filteredCustomers = customers.filter(matches);
  const filteredSuppliers = suppliers.filter(matches);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Partners</h1>
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

      <StatsCards
        customersCount={customers.length}
        suppliersCount={suppliers.length}
      />

      <Tabs defaultValue="customers" className="space-y-4">
        <div className="flex justify-between">
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button onClick={() => handleCreatePartner("customer")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
            <Button
              onClick={() => handleCreatePartner("supplier")}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </div>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
              <CardDescription>
                Manage your customer relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PartnersTable
                data={filteredCustomers}
                type="customer"
                onEdit={(partner) => handleEditPartner(partner, "customer")}
                onDelete={(partner) => handleDeletePartner(partner, "customer")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Suppliers</CardTitle>
              <CardDescription>
                Manage your supplier relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PartnersTable
                data={filteredSuppliers}
                type="supplier"
                onEdit={(partner) => handleEditPartner(partner, "supplier")}
                onDelete={(partner) => handleDeletePartner(partner, "supplier")}
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
        onSubmit={handleSubmitPartner}
      />
    </div>
  );
};

export default PartnersPage;
