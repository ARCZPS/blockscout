defmodule Explorer.Repo.Migrations.CreateL2RelayedMessageEvents do
  use Ecto.Migration

  def change do
    create table(:l2_relayed_message_events, primary_key: false) do
      add(:tx_hash, :bytea, null: false)
      add(:block_number, :bigint, null: false)
      add(:msg_hash, :bytea, null: false, primary_key: true)
      add(:signature, :bytea, null: false)
      add(:timestamp, :utc_datetime_usec, null: false)
      add(:is_merge, :boolean, null: false, default: false)

      timestamps(null: false, type: :utc_datetime_usec)
    end
  end
end
