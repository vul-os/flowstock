import React, { useEffect, useState, useContext } from 'react';
import { Plus, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthContext } from "@/context/use-auth";
import ProductTable from './product-table';
import ProductDialog from './product-dialog';
import ProductVariationDialog from './variations-dialog';
import { useProducts } from './use-products';

const ProductManagement = () => {
  const { activeOrganization } = useContext(AuthContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isVariationDialogOpen, setIsVariationDialogOpen] = useState(false);
  
  const {
    products,
    categories,
    isLoading,
    selectedProduct,
    selectedVariation,
    formData,
    variationForm,
    setSelectedProduct,
    setFormData,
    setVariationForm,
    setSelectedVariation,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleCreateVariation,
    handleUpdateVariation,
    handleDeleteVariation,
    handleEditVariation,
    initialFormState,
    initialVariationState
  } = useProducts(activeOrganization?.id);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveVariation = () => {
    if (selectedVariation) {
      handleUpdateVariation();
    } else {
      handleCreateVariation();
    }
    setIsVariationDialogOpen(false);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>Manage your product catalog</CardDescription>
            </div>
            <Button 
              onClick={() => {
                setSelectedProduct(null);
                setFormData(initialFormState);
                setIsDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          
          <ProductTable
            products={filteredProducts}
            onEdit={(product) => {
              setSelectedProduct(product);
              setFormData({
                name: product.name,
                description: product.description || '',
                category_id: product.category_id,
              });
              setIsDialogOpen(true);
            }}
            onDelete={handleDelete}
            onAddVariation={(product) => {
              setSelectedProduct(product);
              setSelectedVariation(null);
              setVariationForm(initialVariationState);
              setIsVariationDialogOpen(true);
            }}
            onEditVariation={(variation) => {
              handleEditVariation(variation);
              setIsVariationDialogOpen(true);
            }}
            onDeleteVariation={handleDeleteVariation}
          />

          <ProductDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            selectedProduct={selectedProduct}
            formData={formData}
            setFormData={setFormData}
            categories={categories}
            onSave={selectedProduct ? handleUpdate : handleCreate}
          />

          <ProductVariationDialog
            open={isVariationDialogOpen}
            onOpenChange={(isOpen) => {
              setIsVariationDialogOpen(isOpen);
              if (!isOpen) {
                setSelectedVariation(null);
                setVariationForm(initialVariationState);
              }
            }}
            selectedVariation={selectedVariation}
            variationForm={variationForm}
            setVariationForm={setVariationForm}
            onSave={handleSaveVariation}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductManagement;