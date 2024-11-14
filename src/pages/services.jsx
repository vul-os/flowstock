import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  ArrowLeft,
  FilterX,
  RefreshCw,
  Loader2
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from '@/services/supabaseClient';
import { toast } from "sonner";

const ServicesPage = () => {
  const [services, setServices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingService, setEditingService] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices(data);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchServices();
  }, []);

  const handleAddService = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const newService = {
        name: formData.get('name'),
        description: formData.get('description'),
        hourly_rate: parseFloat(formData.get('hourly_rate'))
      };

      const { error } = await supabase
        .from('services')
        .insert([newService]);

      if (error) throw error;

      toast.success('Service added successfully');
      setOpen(false);
      fetchServices();
    } catch (err) {
      toast.error('Failed to add service: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditService = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const updatedService = {
        name: formData.get('name'),
        description: formData.get('description'),
        hourly_rate: parseFloat(formData.get('hourly_rate'))
      };

      const { error } = await supabase
        .from('services')
        .update(updatedService)
        .eq('id', editingService.id);

      if (error) throw error;

      toast.success('Service updated successfully');
      setEditingService(null);
      fetchServices();
    } catch (err) {
      toast.error('Failed to update service: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;

    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Service deleted successfully');
      fetchServices();
    } catch (err) {
      toast.error('Failed to delete service: ' + err.message);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const filteredServices = services.filter(service =>
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ServiceForm = ({ service, onSubmit }) => (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Service Name</Label>
        <Input 
          id="name" 
          name="name" 
          defaultValue={service?.name}
          required 
          className="border-neutral-200 focus:border-blue-500 dark:border-neutral-700"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea 
          id="description" 
          name="description" 
          defaultValue={service?.description}
          className="min-h-[100px] border-neutral-200 focus:border-blue-500 dark:border-neutral-700"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hourly_rate">Hourly Rate (ZAR)</Label>
        <Input 
          id="hourly_rate" 
          name="hourly_rate" 
          type="number" 
          step="0.01" 
          min="0"
          defaultValue={service?.hourly_rate}
          required 
          className="border-neutral-200 focus:border-blue-500 dark:border-neutral-700"
        />
      </div>
      <Button 
        type="submit" 
        className="w-full bg-blue-600 hover:bg-blue-700"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {service ? 'Updating...' : 'Adding...'}
          </>
        ) : (
          service ? 'Update Service' : 'Add Service'
        )}
      </Button>
    </form>
  );

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-900">
      <div className="mx-auto max-w-7xl px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
              Services
            </h1>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              Manage your service offerings and rates
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                New Service
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Service</DialogTitle>
              </DialogHeader>
              <ServiceForm onSubmit={handleAddService} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Actions Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input
              className="pl-10"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {searchQuery && (
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setSearchQuery('')}
                className="h-10 w-10"
              >
                <FilterX className="h-4 w-4 text-neutral-500" />
              </Button>
            )}
            <Button 
              variant="outline" 
              size="icon"
              className="h-10 w-10"
              onClick={fetchServices}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 text-neutral-500 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Services Table */}
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800">
                <TableHead>Service</TableHead>
                <TableHead className="max-w-xl">Description</TableHead>
                <TableHead className="text-right">Hourly Rate</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-red-600">
                    Error loading services. Please try again.
                  </TableCell>
                </TableRow>
              ) : filteredServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-neutral-600">
                    No services found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredServices.map((service) => (
                  <TableRow 
                    key={service.id}
                    className="border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                  >
                    <TableCell className="font-medium text-neutral-900 dark:text-neutral-200">
                      {service.name}
                    </TableCell>
                    <TableCell className="max-w-xl text-neutral-600 dark:text-neutral-400">
                      {service.description}
                    </TableCell>
                    <TableCell className="text-right font-medium text-neutral-900 dark:text-neutral-200">
                      {formatCurrency(service.hourly_rate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end space-x-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingService(service)}
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                              <DialogTitle>Edit Service</DialogTitle>
                            </DialogHeader>
                            <ServiceForm 
                              service={service} 
                              onSubmit={handleEditService} 
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteService(service.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
};

export default ServicesPage;