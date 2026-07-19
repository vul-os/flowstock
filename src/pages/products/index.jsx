import React, { useMemo, useState } from 'react';
import { Plus, Search, Filter, Package2, Boxes, AlertTriangle, Banknote } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/services/api';
import { useTables, useStockLevels, useWorkspace } from '@/context/workspace-context';
import { totalsByVariant, lowStock } from '@/lib/reports';
import ProductTable from './product-table';
import ProductDialog from './product-dialog';
import ProductVariationDialog from './variations-dialog';
import { AdjustStockDialog, TransferStockDialog } from './stock-dialogs';
import { isLowStock } from './helpers';

const FilterDialog = React.memo(({ open, onOpenChange, filters, setFilters, categories }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Filter Products</DialogTitle>
        <DialogDescription>Filter your product catalog based on various criteria.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <label>Category</label>
          <Select
            value={filters.categoryId}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, categoryId: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
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
              onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
            />
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="lowStock"
            checked={filters.lowStock}
            onCheckedChange={(checked) => setFilters((prev) => ({ ...prev, lowStock: checked }))}
          />
          <label htmlFor="lowStock">Show Low Stock Items (at or below reorder point)</label>
        </div>

        <div className="grid gap-2">
          <label>Stock Status</label>
          <Select
            value={filters.inStock}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, inStock: value }))}
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
FilterDialog.displayName = 'FilterDialog';

const StatCard = ({ title, value, icon }) => (
  <Card>
    <CardContent className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      {icon}
    </CardContent>
  </Card>
);

const errText = (err) => String(err?.message || err);

const ProductManagement = () => {
  const { fmtMoney } = useWorkspace();
  const { data, loading } = useTables('products', 'product_variants', 'categories', 'branches');
  const levels = useStockLevels();

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [variationProduct, setVariationProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [adjustVariant, setAdjustVariant] = useState(null);
  const [transferVariant, setTransferVariant] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    categoryId: 'all',
    lowStock: false,
    minPrice: '',
    maxPrice: '',
    inStock: 'all',
  });

  const categories = useMemo(
    () => [...(data.categories || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [data.categories],
  );
  const branches = useMemo(
    () => (data.branches || []).filter((b) => b.is_active !== 0 && b.is_active !== false),
    [data.branches],
  );
  const variants = data.product_variants || [];
  const stockTotals = useMemo(() => totalsByVariant(levels), [levels]);

  const products = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    return [...(data.products || [])]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map((p) => ({
        ...p,
        categoryName: catName.get(p.category_id) || '',
        variants: variants.filter((v) => v.product_id === p.id),
      }));
  }, [data.products, categories, variants]);

  const filteredProducts = useMemo(() => {
    const q = filters.search.toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !q ||
        (product.name || '').toLowerCase().includes(q) ||
        (product.description || '').toLowerCase().includes(q) ||
        product.variants.some(
          (v) =>
            (v.name || '').toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q),
        );

      const matchesCategory =
        filters.categoryId === 'all' || product.category_id === filters.categoryId;

      const matchesPrice =
        (!filters.minPrice && !filters.maxPrice) ||
        product.variants.some((v) => {
          const price = Number(v.price);
          return (
            (!filters.minPrice || price >= Number(filters.minPrice)) &&
            (!filters.maxPrice || price <= Number(filters.maxPrice))
          );
        });

      const matchesStock =
        (!filters.lowStock && filters.inStock === 'all') ||
        product.variants.some((v) => {
          const qty = stockTotals.get(v.id) || 0;
          if (filters.lowStock && isLowStock(v, qty)) return true;
          if (filters.inStock === 'in' && qty > 0) return true;
          if (filters.inStock === 'out' && qty <= 0) return true;
          return false;
        });

      return matchesSearch && matchesCategory && matchesPrice && matchesStock;
    });
  }, [products, filters, stockTotals]);

  const stats = useMemo(() => {
    const stockValue = variants.reduce(
      (sum, v) => sum + (stockTotals.get(v.id) || 0) * Number(v.cost_price || 0),
      0,
    );
    return {
      products: products.length,
      variants: variants.length,
      low: lowStock(variants, levels).length,
      stockValue,
    };
  }, [products, variants, levels, stockTotals]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const saveProduct = async (payload) => {
    const now = new Date().toISOString();
    try {
      if (selectedProduct) {
        await api.putRow('products', selectedProduct.id, { ...payload, updated_at: now });
      } else {
        await api.putRow('products', null, {
          ...payload,
          product_data: '',
          created_at: now,
          updated_at: now,
        });
      }
      toast({ title: selectedProduct ? 'Product updated' : 'Product created' });
    } catch (err) {
      toast({ title: 'Failed to save product', description: errText(err), variant: 'destructive' });
      throw err;
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}" and its ${product.variants.length} variation(s)?`))
      return;
    try {
      for (const v of product.variants) await api.deleteRow('product_variants', v.id);
      await api.deleteRow('products', product.id);
      toast({ title: 'Product deleted' });
    } catch (err) {
      toast({ title: 'Failed to delete product', description: errText(err), variant: 'destructive' });
    }
  };

  const saveVariant = async (payload) => {
    try {
      await api.putRow('product_variants', selectedVariant?.id || null, {
        ...payload,
        product_id: variationProduct.id,
      });
      toast({ title: selectedVariant ? 'Variation updated' : 'Variation created' });
    } catch (err) {
      toast({ title: 'Failed to save variation', description: errText(err), variant: 'destructive' });
      throw err;
    }
  };

  const deleteVariant = async (variant) => {
    if (!window.confirm(`Delete variation "${variant.name}"?`)) return;
    try {
      await api.deleteRow('product_variants', variant.id);
      toast({ title: 'Variation deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete variation',
        description: errText(err),
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Products"
          value={stats.products}
          icon={<Package2 className="h-6 w-6 text-blue-600" />}
        />
        <StatCard
          title="Variations"
          value={stats.variants}
          icon={<Boxes className="h-6 w-6 text-green-600" />}
        />
        <StatCard
          title="Low Stock"
          value={stats.low}
          icon={<AlertTriangle className="h-6 w-6 text-orange-600" />}
        />
        <StatCard
          title="Stock Value (cost)"
          value={fmtMoney(stats.stockValue)}
          icon={<Banknote className="h-6 w-6 text-violet-600" />}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>Manage your product catalog</CardDescription>
            </div>
            <Button
              onClick={() => {
                setSelectedProduct(null);
                setProductDialogOpen(true);
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
                placeholder="Search products, variations, SKUs..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => setFilterDialogOpen(true)}>
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>

          <ProductTable
            products={filteredProducts}
            branches={branches}
            levels={levels}
            stockTotals={stockTotals}
            fmtMoney={fmtMoney}
            onEdit={(product) => {
              setSelectedProduct(product);
              setProductDialogOpen(true);
            }}
            onDelete={deleteProduct}
            onAddVariation={(product) => {
              setVariationProduct(product);
              setSelectedVariant(null);
              setVariationDialogOpen(true);
            }}
            onEditVariation={(product, variant) => {
              setVariationProduct(product);
              setSelectedVariant(variant);
              setVariationDialogOpen(true);
            }}
            onDeleteVariation={deleteVariant}
            onAdjustStock={setAdjustVariant}
            onTransferStock={setTransferVariant}
          />

          <ProductDialog
            open={productDialogOpen}
            onOpenChange={setProductDialogOpen}
            product={selectedProduct}
            categories={categories}
            onSave={saveProduct}
          />

          <ProductVariationDialog
            open={variationDialogOpen}
            onOpenChange={(isOpen) => {
              setVariationDialogOpen(isOpen);
              if (!isOpen) setSelectedVariant(null);
            }}
            variant={selectedVariant}
            onSave={saveVariant}
          />

          <AdjustStockDialog
            open={!!adjustVariant}
            onOpenChange={(isOpen) => !isOpen && setAdjustVariant(null)}
            variant={adjustVariant}
            branches={branches}
            levels={levels}
          />

          <TransferStockDialog
            open={!!transferVariant}
            onOpenChange={(isOpen) => !isOpen && setTransferVariant(null)}
            variant={transferVariant}
            branches={branches}
            levels={levels}
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
