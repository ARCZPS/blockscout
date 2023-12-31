defmodule BlockScoutWeb.AddressContractView do
  use BlockScoutWeb, :view

  alias ABI.{FunctionSelector, TypeDecoder}
  alias Explorer.Chain
  alias Explorer.Chain.{Address, Data, InternalTransaction, Transaction, SmartContract}

  alias BlockScoutWeb.{AccessHelpers}
  alias Explorer.Account.CustomABI
  alias Explorer.SmartContract.{Helper, Writer}

  import BlockScoutWeb.Account.AuthController, only: [current_user: 1]

  def render("scripts.html", %{conn: conn}) do
    render_scripts(conn, "address_contract/code_highlighting.js")
  end

  def format_smart_contract_abi(abi) when not is_nil(abi), do: Poison.encode!(abi, %{pretty: false})

  @doc """
  Returns the correct format for the optimization text.

    iex> BlockScoutWeb.AddressContractView.format_optimization_text(true)
    "true"

    iex> BlockScoutWeb.AddressContractView.format_optimization_text(false)
    "false"
  """
  def format_optimization_text(true), do: gettext("true")
  def format_optimization_text(false), do: gettext("false")

  def format_constructor_arguments(contract, conn) do
    constructor_abi = Enum.find(contract.abi, fn el -> el["type"] == "constructor" && el["inputs"] != [] end)

    input_types = Enum.map(constructor_abi["inputs"], &FunctionSelector.parse_specification_type/1)

    {_, result} =
      contract.constructor_arguments
      |> decode_data(input_types)
      |> Enum.zip(constructor_abi["inputs"])
      |> Enum.reduce({0, "#{contract.constructor_arguments}\n\n"}, fn {val, %{"type" => type}}, {count, acc} ->
        formatted_val = val_to_string(val, type, conn)

        {count + 1, "#{acc}Arg [#{count}] (<b>#{type}</b>) : #{formatted_val}\n"}
      end)

    result
  rescue
    _ -> contract.constructor_arguments
  end

  defp val_to_string(val, type, conn) do
    cond do
      type =~ "[]" ->
        if is_list(val) or is_tuple(val) do
          "[" <>
            Enum.map_join(val, ", ", fn el -> val_to_string(el, String.replace_suffix(type, "[]", ""), conn) end) <> "]"
        else
          to_string(val)
        end

      type =~ "address" ->
        address_hash = "0x" <> Base.encode16(val, case: :lower)

        address = get_address(address_hash)

        get_formatted_address_data(address, address_hash, conn)

      type =~ "bytes" ->
        Base.encode16(val, case: :lower)

      true ->
        to_string(val)
    end
  end

  defp get_address(address_hash) do
    case Chain.string_to_address_hash(address_hash) do
      {:ok, address} -> address
      _ -> nil
    end
  end

  defp get_formatted_address_data(address, address_hash, conn) do
    if address != nil do
      "<a href=" <> address_path(conn, :show, address) <> ">" <> address_hash <> "</a>"
    else
      address_hash
    end
  end

  def decode_data("0x" <> encoded_data, types) do
    decode_data(encoded_data, types)
  end

  def decode_data(encoded_data, types) do
    encoded_data
    |> Base.decode16!(case: :mixed)
    |> TypeDecoder.decode_raw(types)
  end

  def format_external_libraries(libraries, conn) do
    Enum.reduce(libraries, "", fn %{name: name, address_hash: address_hash}, acc ->
      address = get_address(address_hash)
      "#{acc}<span class=\"hljs-title\">#{name}</span> : #{get_formatted_address_data(address, address_hash, conn)}  \n"
    end)
  end

  def contract_lines_with_index(source_code) do
    contract_lines =
      source_code
      |> String.split("\n")

    max_digits =
      contract_lines
      |> Enum.count()
      |> Integer.digits()
      |> Enum.count()

    contract_lines
    |> Enum.with_index(1)
    |> Enum.map(fn {value, line} ->
      {value, String.pad_leading(to_string(line), max_digits, " ")}
    end)
  end

  def contract_creation_code(%Address{
        contract_code: %Data{bytes: <<>>},
        contracts_creation_internal_transaction: %InternalTransaction{init: init}
      }) do
    {:selfdestructed, init}
  end

  def contract_creation_code(%Address{contract_code: contract_code}) do
    {:ok, contract_code}
  end

  def creation_code(%Address{contracts_creation_internal_transaction: %InternalTransaction{}} = address) do
    address.contracts_creation_internal_transaction.init
  end

  def creation_code(%Address{contracts_creation_transaction: %Transaction{}} = address) do
    address.contracts_creation_transaction.input
  end

  def creation_code(%Address{contracts_creation_transaction: nil}) do
    nil
  end

  def sourcify_repo_url(address_hash, partial_match) do
    checksummed_hash = Address.checksum(address_hash)
    chain_id = Application.get_env(:explorer, Explorer.ThirdPartyIntegrations.Sourcify)[:chain_id]
    repo_url = Application.get_env(:explorer, Explorer.ThirdPartyIntegrations.Sourcify)[:repo_url]
    match = if partial_match, do: "/partial_match/", else: "/full_match/"
    repo_url <> match <> chain_id <> "/" <> checksummed_hash <> "/"
  end

  def smart_contract_with_read_only_functions?(%Address{smart_contract: %SmartContract{}} = address) do
    Enum.any?(address.smart_contract.abi || [], &is_read_function?(&1))
  end

  def smart_contract_with_read_only_functions?(%Address{smart_contract: nil}), do: false

  def is_read_function?(function), do: Helper.queriable_method?(function) || Helper.read_with_wallet_method?(function)

  def smart_contract_is_proxy?(%Address{smart_contract: %SmartContract{} = smart_contract}) do
    SmartContract.proxy_contract?(smart_contract)
  end

  def smart_contract_is_proxy?(%Address{smart_contract: nil}), do: false

  def smart_contract_with_write_functions?(%Address{smart_contract: %SmartContract{}} = address) do
    Enum.any?(
      address.smart_contract.abi || [],
      &Writer.write_function?(&1)
    )
  end

  def smart_contract_with_write_functions?(%Address{smart_contract: nil}), do: false

  def fetch_custom_abi(conn, address_hash) do
    if current_user = current_user(conn) do
      CustomABI.get_custom_abi_by_identity_id_and_address_hash(address_hash, current_user.id)
    end
  end

  def has_address_custom_abi_with_read_functions?(conn, address_hash) do
    custom_abi = fetch_custom_abi(conn, address_hash)

    check_custom_abi_for_having_read_functions(custom_abi)
  end

  def check_custom_abi_for_having_read_functions(custom_abi),
    do: !is_nil(custom_abi) && Enum.any?(custom_abi.abi, &is_read_function?(&1))

  def has_address_custom_abi_with_write_functions?(conn, address_hash) do
    custom_abi = fetch_custom_abi(conn, address_hash)

    check_custom_abi_for_having_write_functions(custom_abi)
  end

  def check_custom_abi_for_having_write_functions(custom_abi),
    do: !is_nil(custom_abi) && Enum.any?(custom_abi.abi, &Writer.write_function?(&1))
end
