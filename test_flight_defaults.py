from tools.flight_tool import DEFAULT_ORIGIN_IATA, parse_route


def test_default_origin_is_delhi():
    assert DEFAULT_ORIGIN_IATA == "DEL"


def test_destination_only_trip_uses_india_default():
    assert parse_route("Plan a 7-day Japan trip") == ("DEL", "NRT")


def test_explicit_origin_overrides_india_default():
    assert parse_route("Plan a trip from Dhaka to Japan") == ("DAC", "NRT")
