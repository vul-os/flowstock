import React, { useEffect, useState, useContext } from 'react';
import { Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AuthContext } from "@/context/use-auth";
import { supabase } from '@/services/supabaseClient';
import ProductVariationDialog from './variations';

const ProductManagement = () => {
  const { activeOrganization } = useContext(AuthContext);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isVariationDialogOpen, setIsVariationDialogOpen] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState({});
  const [selectedVariation, setSelectedVariation] = useState(null);

  const initialFormState = {
    name: '',
    description: '',
    category_id: '',
    organization_id: activeOrganization?.id
  };

  const initialVariationState = {
    sku: '',
    name: '',
    price: '',
    stock_quantity: '',
    attributes: {}
  };

  const [formData, setFormData] = useState(initialFormState);
  const [variationForm, setVariationForm] = useState(initialVariationState);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories (name),
          product_variants (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleCreate = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([formData])
        .select();

      if (error) throw error;
      await fetchProducts();
      setFormData(initialFormState);
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error creating product:', error);
    }
  };

  const handleUpdate = async () => {
    try {
      const { error } = await supabase
        .from('products')
        .update(formData)
        .eq('id', selectedProduct.id);

      if (error) throw error;
      await fetchProducts();
      setFormData(initialFormState);
      setSelectedProduct(null);
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', id);

        if (error) throw error;
        await fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
      }
    }
  };

  const handleCreateVariation = async () => {
    try {
      const { data, error } = await supabase
        .from('product_variants')
        .insert([{
          ...variationForm,
          product_id: selectedProduct.id
        }])
        .select();

      if (error) throw error;
      await fetchProducts();
      setVariationForm(initialVariationState);
      setIsVariationDialogOpen(false);
    } catch (error) {
      console.error('Error creating variation:', error);
    }
  };

  const handleUpdateVariation = async () => {
    try {
      const { error } = await supabase
        .from('product_variants')
        .update(variationForm)
        .eq('id', selectedVariation.id);

      if (error) throw error;
      await fetchProducts();
      setVariationForm(initialVariationState);
      setSelectedVariation(null);
      setIsVariationDialogOpen(false);
    } catch (error) {
      console.error('Error updating variation:', error);
    }
  };

  const handleDeleteVariation = async (variationId) => {
    if (window.confirm('Are you sure you want to delete this variation?')) {
      try {
        const { error } = await supabase
          .from('product_variants')
          .delete()
          .eq('id', variationId);

        if (error) throw error;
        await fetchProducts();
      } catch (error) {
        console.error('Error deleting variation:', error);
      }
    }
  };

  const toggleProductExpansion = (productId) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      category_id: product.category_id,
    });
    setIsDialogOpen(true);
  };

  const handleEditVariation = (variation) => {
    setSelectedVariation(variation);
    setVariationForm({
      sku: variation.sku,
      name: variation.name,
      price: variation.price,
      stock_quantity: variation.stock_quantity,
      attributes: variation.attributes || {}
    });
    setIsVariationDialogOpen(true);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>Manage your product catalog</CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={() => {
                    setSelectedProduct(null);
                    setFormData(initialFormState);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {selectedProduct ? 'Edit Product' : 'Add New Product'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={selectedProduct ? handleUpdate : handleCreate}>
                    {selectedProduct ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <React.Fragment key={product.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleProductExpansion(product.id)}
                      >
                        {expandedProducts[product.id] ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.description}</TableCell>
                    <TableCell>{product.categories?.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedProduct(product);
                            setVariationForm(initialVariationState);
                            setIsVariationDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Variation
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedProducts[product.id] && product.product_variants?.map((variation) => (
                    <TableRow key={variation.id} className="bg-muted/50">
                      <TableCell></TableCell>
                      <TableCell className="pl-8">
                        {variation.name} ({variation.sku})
                      </TableCell>
                      <TableCell>
                        Price: ${variation.price} | Stock: {variation.stock_quantity}
                      </TableCell>
                      <TableCell>
                        {Object.entries(variation.attributes || {}).map(([key, value]) => (
                          <span key={key} className="mr-2">
                            {key}: {value}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditVariation(variation)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteVariation(variation.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>

          <ProductVariationDialog
            open={isVariationDialogOpen}
            onOpenChange={setIsVariationDialogOpen}
            selectedVariation={selectedVariation}
            variationForm={variationForm}
            setVariationForm={setVariationForm}
            onSave={selectedVariation ? handleUpdateVariation : handleCreateVariation}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductManagement;