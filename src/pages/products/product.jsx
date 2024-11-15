import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, ArrowLeft, Save, Edit2, X } from "lucide-react";
import { supabase } from '@/services/supabaseClient';
import { toast } from '@/components/ui/use-toast';

// Default state structure
const defaultProductData = {
  material: '',
  assortment: '',
  applications: '',
  specifications: {
    lengthRange: '',
    material: '',
    finish: '',
    headType: '',
    threadType: '',
    packageQuantity: ''
  }
};

const ProductPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState({
    id: '',
    name: '',
    description: '',
    product_data: defaultProductData
  });

  // Fetch product data
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        // Ensure product_data and specifications exist with default values
        const product_data = data.product_data || {};
        const specifications = product_data.specifications || {};
        
        setProduct({
          ...data,
          product_data: {
            material: product_data.material || '',
            assortment: product_data.assortment || '',
            applications: product_data.applications || '',
            specifications: {
              lengthRange: specifications.lengthRange || '',
              material: specifications.material || '',
              finish: specifications.finish || '',
              headType: specifications.headType || '',
              threadType: specifications.threadType || '',
              packageQuantity: specifications.packageQuantity || ''
            }
          }
        });
      } catch (error) {
        console.error('Error fetching product:', error);
        toast({
          title: "Error",
          description: "Failed to fetch product details",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProduct();
  }, [id]);

  // Handle save
  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: product.name,
          description: product.description,
          product_data: product.product_data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Product updated successfully"
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive"
      });
    }
  };

  // Handle field changes
  const handleChange = (field, value, nestedField) => {
    if (nestedField) {
      setProduct(prev => ({
        ...prev,
        product_data: {
          ...prev.product_data,
          specifications: {
            ...prev.product_data.specifications,
            [nestedField]: value
          }
        }
      }));
    } else if (field in product) {
      setProduct(prev => ({
        ...prev,
        [field]: value
      }));
    } else {
      setProduct(prev => ({
        ...prev,
        product_data: {
          ...prev.product_data,
          [field]: value
        }
      }));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Ensure product_data and specifications exist
  const product_data = product.product_data || defaultProductData;
  const specifications = product_data.specifications || {};

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-900">
      {/* Back Button and Edit Controls */}
      <div className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="mx-auto max-w-7xl px-8 py-4 flex justify-between items-center">
          <Link 
            to="/admin/products"
            className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Link>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button onClick={() => setIsEditing(false)} variant="outline">
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Product
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Top Section - Title, Description */}
        <div className="mb-16 grid gap-16 lg:grid-cols-2">
          <div className="space-y-6">
            {isEditing ? (
              <>
                <Input
                  value={product.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="text-4xl font-bold"
                  placeholder="Product Name"
                />
                <Textarea
                  value={product.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="h-32"
                  placeholder="Product Description"
                />
              </>
            ) : (
              <>
                <h1 className="text-6xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
                  {product.name}
                </h1>
                <p className="text-pretty text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {product.description}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="specifications" className="w-full">
          <TabsList className="mb-8 inline-flex w-auto space-x-8 rounded-none border-b border-neutral-200 bg-transparent p-0 dark:border-neutral-700">
            <TabsTrigger 
              value="specifications" 
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-base font-medium data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            >
              Specifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="specifications">
            <div className="grid gap-16 lg:grid-cols-2">
              <div className="space-y-8">
                {[
                  {
                    key: 'material',
                    title: "Material",
                    value: product_data.material
                  },
                  {
                    key: 'assortment',
                    title: "Assortment",
                    value: product_data.assortment
                  },
                  {
                    key: 'applications',
                    title: "Applications",
                    value: product_data.applications
                  }
                ].map((spec) => (
                  <div key={spec.key}>
                    <h3 className="mb-2 text-lg font-bold text-neutral-800 dark:text-neutral-200">
                      {spec.title}
                    </h3>
                    {isEditing ? (
                      <Textarea
                        value={spec.value || ''}
                        onChange={(e) => handleChange(spec.key, e.target.value)}
                        className="h-24"
                      />
                    ) : (
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {spec.value}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <Card className="h-fit border-neutral-100 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-800">
                <CardContent className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="pb-4 text-left text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Specification
                        </th>
                        <th className="pb-4 text-right text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {[
                        { key: 'lengthRange', label: 'Length Range' },
                        { key: 'material', label: 'Material' },
                        { key: 'finish', label: 'Finish' },
                        { key: 'headType', label: 'Head Type' },
                        { key: 'threadType', label: 'Thread Type' },
                        { key: 'packageQuantity', label: 'Package Quantity' }
                      ].map((row) => (
                        <tr key={row.key}>
                          <td className="py-4 text-neutral-600 dark:text-neutral-400">
                            {row.label}
                          </td>
                          <td className="py-4 text-right text-neutral-600 dark:text-neutral-400">
                            {isEditing ? (
                              <Input
                                value={specifications[row.key] || ''}
                                onChange={(e) => handleChange('specifications', e.target.value, row.key)}
                                className="text-right"
                              />
                            ) : (
                              specifications[row.key] || ''
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default ProductPage;