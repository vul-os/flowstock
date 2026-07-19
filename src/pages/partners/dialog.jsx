import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const emptyForm = {
  name: '',
  company_name: '',
  email: '',
  phone: '',
  address: '',
  billing_address: '',
  shipping_address: '',
  tax_number: '',
  payment_terms: '',
  credit_limit: '',
  notes: '',
  is_active: true,
};

export const PartnerDialog = ({ open, onClose, partner, type, onSubmit }) => {
  const isCustomer = type === 'customer';
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({ ...emptyForm, ...(partner || {}), is_active: partner ? !!partner.is_active : true });
    }
  }, [open, partner, type]);

  const set = (field) => (e) => setFormData((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const table = isCustomer ? 'customers' : 'suppliers';
    const common = {
      name: formData.name.trim(),
      company_name: formData.company_name,
      email: formData.email,
      phone: formData.phone,
      tax_number: formData.tax_number,
      payment_terms: formData.payment_terms,
      notes: formData.notes,
      is_active: formData.is_active ? 1 : 0,
    };
    const data = isCustomer
      ? {
          ...common,
          billing_address: formData.billing_address,
          shipping_address: formData.shipping_address,
          credit_limit: formData.credit_limit === '' ? 0 : Number(formData.credit_limit),
        }
      : { ...common, address: formData.address };

    setSaving(true);
    try {
      await onSubmit(data, table);
      onClose();
    } catch {
      // error already surfaced via toast by the caller; keep the dialog open
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {partner ? 'Edit' : 'New'} {isCustomer ? 'Customer' : 'Supplier'}
          </DialogTitle>
          <DialogDescription>
            Add or update {isCustomer ? 'customer' : 'supplier'} details
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={set('name')} required />
            </div>
            <div>
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={set('company_name')}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={set('email')} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={formData.phone} onChange={set('phone')} />
            </div>
            {isCustomer ? (
              <>
                <div>
                  <Label htmlFor="billing_address">Billing Address</Label>
                  <Textarea
                    id="billing_address"
                    value={formData.billing_address}
                    onChange={set('billing_address')}
                  />
                </div>
                <div>
                  <Label htmlFor="shipping_address">Shipping Address</Label>
                  <Textarea
                    id="shipping_address"
                    value={formData.shipping_address}
                    onChange={set('shipping_address')}
                  />
                </div>
                <div>
                  <Label htmlFor="credit_limit">Credit Limit</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.credit_limit}
                    onChange={set('credit_limit')}
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" value={formData.address} onChange={set('address')} />
              </div>
            )}
            <div>
              <Label htmlFor="tax_number">Tax Number</Label>
              <Input id="tax_number" value={formData.tax_number} onChange={set('tax_number')} />
            </div>
            <div>
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input
                id="payment_terms"
                value={formData.payment_terms}
                onChange={set('payment_terms')}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes} onChange={set('notes')} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={!!formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((f) => ({ ...f, is_active: !!checked }))
                }
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : `${partner ? 'Update' : 'Create'} ${isCustomer ? 'Customer' : 'Supplier'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
