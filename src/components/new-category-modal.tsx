'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useFinancial } from '@/context/financial-context'
import { useSubscription } from '@/hooks/use-subscription'
import type { Category } from '@/lib/supabase-client'

interface NewCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  editingCategory?: Category | null
}

const categoryIcons = [
  '💰', '💼', '🏠', '🍽️', '🚗', '🎬', '🛒', '⚡', '📱', '💊', 
  '👕', '🎓', '✈️', '🏥', '🎨', '📚', '🏋️', '💅', '🐕', '💡'
]

const categoryColors = [
  '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
]

export function NewCategoryModal({ isOpen, onClose, editingCategory }: NewCategoryModalProps) {
  const { addCategory, updateCategory } = useFinancial()
  const { isTrialExpired } = useSubscription()
  const [formData, setFormData] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense',
    icon: '💰',
    color: '#22c55e'
  })

  // Verificar trial expirado ao abrir modal
  useEffect(() => {
    if (isOpen && isTrialExpired()) {
      onClose()
      window.location.href = '/planos'
      return
    }
  }, [isOpen, isTrialExpired, onClose])

  // Carregar dados quando editando
  useEffect(() => {
    if (editingCategory) {
      setFormData({
        name: editingCategory.name,
        type: editingCategory.type,
        icon: editingCategory.icon,
        color: editingCategory.color
      })
    } else {
      // Reset para nova categoria
      setFormData({
        name: '',
        type: 'expense',
        icon: '💰',
        color: '#22c55e'
      })
    }
  }, [editingCategory, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isTrialExpired()) {
      window.location.href = '/planos'
      return
    }
    
    if (!formData.name.trim()) {
      alert('Por favor, digite o nome da categoria.')
      return
    }

    try {
      if (editingCategory) {
        // Editar categoria existente
        await updateCategory(editingCategory.id, formData)
      } else {
        // Criar nova categoria
        await addCategory(formData)
      }

      onClose()
    } catch (error) {
      console.error('Erro ao salvar categoria:', error)
      alert('Erro ao salvar categoria. Tente novamente.')
    }
  }

  if (!isOpen) return null

  const isEditing = !!editingCategory

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white lg:rounded-lg shadow-lg max-w-md w-full m-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-green-600 to-emerald-600 text-white lg:rounded-t-lg flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold">#</span>
            </div>
            <h3 className="text-lg font-semibold">
              {isEditing ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-green-100 hover:text-white p-2 touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-green-400 scrollbar-track-green-100 hover:scrollbar-thumb-green-500">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Categoria *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Ex: Alimentação"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as 'income' | 'expense'})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ícone
              </label>
              <div className="grid grid-cols-10 gap-2 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-green-300 scrollbar-track-green-50 pr-2">
                {categoryIcons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setFormData({...formData, icon})}
                    className={`p-2 text-xl border rounded-lg hover:bg-gray-50 ${
                      formData.icon === icon ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cor
              </label>
              <div className="grid grid-cols-5 gap-2">
                {categoryColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({...formData, color})}
                    className={`w-8 h-8 rounded-full border-2 ${
                      formData.color === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Espaçamento extra para melhor scroll no mobile */}
            <div className="pb-4"></div>
          </div>
        </form>

        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50 lg:bg-white flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700"
          >
            {isEditing ? 'Salvar Alterações' : 'Criar Categoria'}
          </button>
        </div>
      </div>
    </div>
  )
} 