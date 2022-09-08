defmodule Explorer.Repo.Migrations.CreateL1ToL2 do
  use Ecto.Migration

  def change do
    create table(:l1_to_l2, primary_key: false) do
      add(:hash, :bytea, null: false, primary_key: true)
      add(:l2_hash, :bytea, null: false)
      add(:block, :bigint, null: false)
      add(:timestamp, :utc_datetime_usec, null: false)
      add(:tx_origin, :bytea, null: false)
      add(:queue_index, :bigint, null: false)
      add(:data, :bytea, null: false)
      add(:target, :bytea, null: false)
      add(:gas_limit, :numeric, precision: 100, null: false)
      add(:gas_used, :numeric, precision: 100, null: false)
      add(:gas_price, :numeric, precision: 100, null: false)
      add(:fee_scalar, :bigint, null: false)

      timestamps(null: false, type: :utc_datetime_usec)
    end
  end
end
