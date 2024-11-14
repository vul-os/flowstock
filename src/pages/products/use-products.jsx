import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';

export const useProducts = (organizationId) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariation, setSelectedVariation] = useState(null);

  const initialFormState = {
    name: '',
    description: '',
    category_id: '',
    organization_id: organizationId
  };

  const initialVariationState = {
    sku: '',
    name: '',
    price: '',
    stock_quantity: '',
    attributes: {},
    product_id: null
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
      const { error } = await supabase
        .from('products')
        .insert([formData])
        .select();

      if (error) throw error;
      await fetchProducts();
      setFormData(initialFormState);
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
      const { error } = await supabase
        .from('product_variants')
        .insert([{
          ...variationForm,
          product_id: selectedProduct.id
        }])
        .select();

      if (error) throw error;
      await fetchProducts();
      setVariationForm(initialVariationState);
      setSelectedVariation(null);
    } catch (error) {
      console.error('Error creating variation:', error);
    }
  };

  const handleUpdateVariation = async () => {
    try {
      const { error } = await supabase
        .from('product_variants')
        .update({
          sku: variationForm.sku,
          name: variationForm.name,
          price: variationForm.price,
          stock_quantity: variationForm.stock_quantity,
          attributes: variationForm.attributes,
          product_id: variationForm.product_id // Use the stored product_id
        })
        .eq('id', selectedVariation.id);

      if (error) throw error;
      await fetchProducts();
      setVariationForm(initialVariationState);
      setSelectedVariation(null);
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

  const handleEditVariation = (variation) => {
    setSelectedVariation(variation);
    setVariationForm({
      sku: variation.sku || '',
      name: variation.name || '',
      price: variation.price || '',
      stock_quantity: variation.stock_quantity || '',
      attributes: variation.attributes || {},
      product_id: variation.product_id // Store the product_id in the form
    });
  };

  return {
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
  };
};

export default useProducts;