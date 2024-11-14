import React, { useState } from 'react';
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, Package, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Currency formatter for South African Rand
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(amount).replace('ZAR', 'R');
};

const ProductTable = ({ 
  products, 
  onEdit, 
  onDelete, 
  onAddVariation, 
  onEditVariation, 
  onDeleteVariation 
}) => {
  const [expandedProducts, setExpandedProducts] = useState({});
  const navigate = useNavigate();

  const toggleProductExpansion = (productId) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const handleViewProduct = (productId) => {
    navigate(`/admin/products/${productId}`);
  };

  return (
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
        {products.map((product) => (
          <React.Fragment key={product.id}>
            <TableRow className="border-b-0">
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
              <TableCell className="font-medium">
                {product.name}
                <Badge variant="outline" className="ml-2">
                  {product.product_variants?.length || 0} variations
                </Badge>
              </TableCell>
              <TableCell>{product.description}</TableCell>
              <TableCell>
                <Badge variant="secondary">{product.categories?.name}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewProduct(product.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(product)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddVariation(product)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variation
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            {expandedProducts[product.id] && (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <div className="bg-muted/30 py-2">
                    <div className="grid grid-cols-1 gap-2 px-4">
                      {product.product_variants?.length > 0 ? (
                        product.product_variants.map((variation) => (
                          <div key={variation.id} className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm">
                            <div className="flex items-center gap-4">
                              <Package className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <div className="font-medium">
                                  {variation.name}
                                  <Badge variant="outline" className="ml-2">{variation.sku}</Badge>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {Object.entries(variation.attributes || {}).map(([key, value]) => (
                                    <Badge key={key} variant="secondary" className="mr-2">
                                      {key}: {value}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="font-medium">{formatCurrency(variation.price)}</div>
                                <div className="text-sm text-muted-foreground">
                                  Stock: {variation.stock_quantity}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onEditVariation(variation)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onDeleteVariation(variation.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          No variations added yet
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
};

export default ProductTable;