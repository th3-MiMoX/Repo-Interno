import { authFetch } from './authService';

export interface CategoriaOption {
    uuid: string;
    nombre: string;
}

/** Trae la lista de categorías desde la API. Compartido entre los modales
 * de subir/editar documento para no duplicar la misma llamada. */
export async function fetchCategorias(): Promise<CategoriaOption[]> {
    const response = await authFetch('/dashboard/categories');
    if (!response.ok) throw new Error('No se pudieron cargar las categorías');
    return response.json();
}

/** Llena un <select> con las categorías, con los mismos textos de estado
 * (cargando / error) usados en ambos modales. */
export async function loadCategoriasInto(select: HTMLSelectElement, selected?: string): Promise<void> {
    select.innerHTML = '<option value="">Cargando categorías…</option>';

    try {
        const categorias = await fetchCategorias();
        select.innerHTML =
            '<option value="">Selecciona una categoría…</option>' +
            categorias.map((c) => `<option value="${c.uuid}">${c.nombre}</option>`).join('');

        if (selected) select.value = selected;
    } catch (error) {
        console.error('Error al cargar categorías:', error);
        select.innerHTML = '<option value="">No se pudieron cargar las categorías</option>';
    }
}
