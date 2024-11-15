import React, { useEffect, useState, useContext } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AuthContext } from "@/context/use-auth";
import ProductTable from './product-table';
import ProductDialog from './product-dialog';
import ProductVariationDialog from './variations-dialog';
import { useProducts } from './use-products';

const STOCK_THRESHOLD = 10;

const FilterDialog = React.memo(({ open, onOpenChange, filters, setFilters, categories }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Filter Products</DialogTitle>
        <DialogDescription>
          Filter your product catalog based on various criteria.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <label>Category</label>
          <Select
            value={filters.categoryId}
            onValueChange={(value) => setFilters(prev => ({ ...prev, categoryId: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label>Price Range</label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minPrice}
              onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value }))}
            />
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="lowStock"
            checked={filters.lowStock}
            onCheckedChange={(checked) => 
              setFilters(prev => ({ ...prev, lowStock: checked }))
            }
          />
          <label htmlFor="lowStock">Show Low Stock Items (Below {STOCK_THRESHOLD})</label>
        </div>

        <div className="grid gap-2">
          <label>Stock Status</label>
          <Select
            value={filters.inStock}
            onValueChange={(value) => setFilters(prev => ({ ...prev, inStock: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select stock status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in">In Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </DialogContent>
  </Dialog>
));

const ProductManagement = () => {
  const { activeOrganization } = useContext(AuthContext);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isVariationDialogOpen, setIsVariationDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    categoryId: 'all',
    lowStock: false,
    minPrice: '',
    maxPrice: '',
    inStock: 'all',
  });
  
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

  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      product.description?.toLowerCase().includes(filters.search.toLowerCase());

    const matchesCategory = 
      filters.categoryId === 'all' || product.category_id === filters.categoryId;

    const variants = product.variants || [];
    
    const matchesPrice = (!filters.minPrice && !filters.maxPrice) || variants.some(variant => {
      const price = Number(variant.price);
      return (!filters.minPrice || price >= filters.minPrice) &&
             (!filters.maxPrice || price <= filters.maxPrice);
    });

    const matchesStock = !filters.lowStock && filters.inStock === 'all' || variants.some(variant => {
      const stock = Number(variant.stock_quantity);
      if (filters.lowStock && stock < STOCK_THRESHOLD) return true;
      if (filters.inStock === 'in' && stock > 0) return true;
      if (filters.inStock === 'out' && stock === 0) return true;
      return false;
    });

    return matchesSearch && matchesCategory && matchesPrice && matchesStock;
  });

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
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setFilterDialogOpen(true)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
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

          <FilterDialog
            open={filterDialogOpen}
            onOpenChange={setFilterDialogOpen}
            filters={filters}
            setFilters={setFilters}
            categories={categories}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductManagement;