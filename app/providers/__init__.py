"""Data providers for CityChilly.

Each provider talks to a single open data source and returns normalised data.
All providers are designed to fail soft: if an upstream API is unavailable the
app keeps working with whatever data is available.
"""
