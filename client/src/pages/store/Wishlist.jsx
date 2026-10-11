import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { ProductGrid } from '../../components/ProductCard'
import { EmptyState, PageHeader } from '../../components/ui'
import { selectWishlist } from '../../features/wishlist/wishlistSlice'

export default function Wishlist() {
  const items = useSelector(selectWishlist)


  return (
    <div className="container-page py-6">
      <PageHeader title="My wishlist" subtitle={items.length ? `${items.length} saved item${items.length === 1 ? '' : 's'}` : undefined} />
      {items.length ? (
        <ProductGrid products={items} />
      ) : (
        <EmptyState
          icon="💚"
          title="Your wishlist is empty"
          text="Tap the heart on any product to save it here for later."
          action={
            <Link to="/" className="btn-primary">
              Explore products
            </Link>
          }
        />
      )}
    </div>
  )
}
